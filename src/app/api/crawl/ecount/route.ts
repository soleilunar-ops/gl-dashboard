import { NextRequest, NextResponse } from "next/server";
import { chromium, type BrowserContext, type Download, type Frame, type Page } from "playwright";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";

const CRAWL_DRY_RUN = process.env.CRAWL_DRY_RUN === "true";

type LocatorScope = Page | Frame;
type RawXlsxRow = Record<string, unknown>;
type InputHint = {
  id: string | null;
  name: string | null;
  type: string | null;
  placeholder: string | null;
};
type FrameHints = { url: string; title?: string; inputs: InputHint[] };
type CookieHint = { name: string; domain: string; path: string };

// ─────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────

function getScopes(page: Page): LocatorScope[] {
  return [page, ...page.frames()];
}

async function getPageTextSnippet(page: Page): Promise<string> {
  try {
    const txt = await page.evaluate(() => document.body?.innerText ?? "");
    return txt.replace(/\s+/g, " ").slice(0, 300);
  } catch {
    return "";
  }
}

async function collectFrameHints(page: Page): Promise<FrameHints[]> {
  const hints: FrameHints[] = [];
  for (const fr of page.frames()) {
    try {
      const url = fr.url();
      const inputs = await fr.evaluate(() =>
        Array.from(document.querySelectorAll("input"))
          .slice(0, 30)
          .map((el) => ({
            id: el.getAttribute("id"),
            name: el.getAttribute("name"),
            type: el.getAttribute("type"),
            placeholder: el.getAttribute("placeholder"),
          }))
      );
      let title: string | undefined;
      try {
        title = await fr.title();
      } catch {
        /* ignore */
      }
      hints.push({ url, title, inputs });
    } catch {
      hints.push({ url: fr.url(), inputs: [] });
    }
  }
  return hints;
}

async function collectCookieHints(context: BrowserContext): Promise<CookieHint[]> {
  const cookies = await context.cookies();
  return cookies.slice(0, 30).map((c) => ({ name: c.name, domain: c.domain, path: c.path }));
}

// ─────────────────────────────────────────────
// fillFirst: 여러 프레임 × 여러 셀렉터에서 첫 번째 입력 필드에 값 입력
// count() > 0 인 것만 시도 (visibility 무관하게 DOM에 존재하면 OK)
// ─────────────────────────────────────────────
async function fillFirst(
  scopes: LocatorScope[],
  selectors: string[],
  value: string,
  label: string
) {
  for (const scope of scopes) {
    for (const sel of selectors) {
      try {
        const loc = scope.locator(sel).first();
        if ((await loc.count()) > 0) {
          await loc.fill(value, { timeout: 3000 });
          return;
        }
      } catch {
        /* 다음 시도 */
      }
    }
  }
  throw new Error(`${label} 입력칸을 찾지 못했습니다. (페이지 구조 변경/로딩 실패 가능)`);
}

// ─────────────────────────────────────────────
// clickFirst: 여러 프레임 × 여러 셀렉터에서 첫 번째 클릭 가능 요소 클릭
// ─────────────────────────────────────────────
async function clickFirst(scopes: LocatorScope[], selectors: string[], label: string) {
  for (const scope of scopes) {
    for (const sel of selectors) {
      try {
        const loc = scope.locator(sel).first();
        if ((await loc.count()) > 0) {
          await loc.click({ timeout: 3000 });
          return;
        }
      } catch {
        /* 다음 시도 */
      }
    }
  }
  throw new Error(`${label} 버튼을 찾지 못했습니다. (페이지 구조 변경/로딩 실패 가능)`);
}

// ─────────────────────────────────────────────
// isLoginLikeUrl / isPotentialAppUrl
// ─────────────────────────────────────────────
function isLoginLikeUrl(url: string): boolean {
  return (
    url.includes("login.ecount.com") ||
    url.includes("/app.login/erp_login") ||
    url.includes("/Login/")
  );
}

function isPotentialAppUrl(url: string, companyCode: string): boolean {
  const lowered = url.toLowerCase();
  return (
    (lowered.includes(`${companyCode.toLowerCase()}.ecount.com`) ||
      lowered.includes(".ecount.com/e") ||
      lowered.includes("/ec5/")) &&
    !isLoginLikeUrl(lowered)
  );
}

async function pickBestPageAfterLogin(
  context:
    | Awaited<ReturnType<typeof chromium.launchPersistentContext>>
    | Awaited<ReturnType<typeof chromium.launch>> extends infer T
    ? T extends { newContext(): unknown }
      ? Awaited<ReturnType<T["newContext"]>>
      : never
    : never,
  fallbackPage: Page,
  companyCode: string
): Promise<Page> {
  const pages = context.pages() as Page[];
  const appPage = pages.find((p) => isPotentialAppUrl(p.url(), companyCode));
  if (appPage) return appPage;
  const nonBlank = pages.find((p) => p.url() && p.url() !== "about:blank" && p !== fallbackPage);
  return nonBlank ?? fallbackPage;
}

async function detectLoginError(page: Page): Promise<string | null> {
  const snippet = await getPageTextSnippet(page);
  if (!snippet) return null;
  if (snippet.includes("아이디") && snippet.includes("비밀번호") && snippet.includes("로그인"))
    return "로그인에 실패했습니다. 회사코드/아이디/비밀번호를 확인해주세요.";
  if (snippet.includes("보안문자") || snippet.includes("captcha"))
    return "로그인 보안문자/차단 페이지가 표시되어 자동 크롤링이 불가능합니다.";
  return null;
}

// ─────────────────────────────────────────────
// waitForContentFrame
// 핵심: mainFrame() 은 반드시 제외하고,
//       ecount.com 도메인의 자식 iframe이 나타날 때까지 최대 timeoutMs 폴링
// ─────────────────────────────────────────────
async function waitForContentFrame(page: Page, timeoutMs = 20000): Promise<Frame | null> {
  const startedAt = Date.now();
  const mainFrame = page.mainFrame();

  const pick = (): Frame | null => {
    for (const f of page.frames()) {
      if (f === mainFrame) continue; // 메인 프레임 절대 제외
      const url = f.url();
      if (!url || url === "about:blank" || url === "about:srcdoc") continue;
      if (url.includes("ecount.com")) return f; // 이카운트 자식 프레임
    }
    return null;
  };

  let found = pick();
  while (!found && Date.now() - startedAt < timeoutMs) {
    await page.waitForTimeout(400);
    found = pick();
  }
  return found;
}

// ─────────────────────────────────────────────
// POST 핸들러
// ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // 인증 체크 (대시보드 로그인 사용자만 호출 가능 — ERP 자격증명 보호)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  // 환경변수 검증 (모듈 로드 시점이 아닌 요청 시점에 체크)
  const COMPANY = process.env.ECOUNT_COMPANY_CODE;
  const USER_ID = process.env.ECOUNT_USER_ID;
  const PASSWORD = process.env.ECOUNT_PASSWORD;
  if (!COMPANY || !USER_ID || !PASSWORD) {
    return NextResponse.json(
      {
        error: "이카운트 자격증명 환경변수가 설정되지 않았습니다.",
        missing: {
          ECOUNT_COMPANY_CODE: !COMPANY,
          ECOUNT_USER_ID: !USER_ID,
          ECOUNT_PASSWORD: !PASSWORD,
        },
      },
      { status: 500 }
    );
  }

  const { item_code, date_from, date_to } = await req.json();

  if (!item_code) {
    return NextResponse.json({ error: "ERP 코드가 없어 크롤링할 수 없습니다." }, { status: 400 });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  try {
    // ── 1. 로그인 ─────────────────────────────────────────
    await page.goto("https://login.ecount.com/Login/?lan_type=ko-KR/", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(800);
    await page.waitForLoadState("networkidle").catch(() => {});

    const loginScopes = getScopes(page);

    try {
      await fillFirst(
        loginScopes,
        [
          "#com_code",
          'input[name="com_code"]',
          'input[name="comCode"]',
          'input[name="company"]',
          'input[id*="com"][id*="code" i]',
          'input[placeholder*="회사"]',
          'input[placeholder*="Company"]',
        ],
        COMPANY,
        "회사코드"
      );
    } catch (e) {
      const url = page.url().slice(0, 300);
      const frameHints = await collectFrameHints(page);
      const pageSnippet = await getPageTextSnippet(page);
      return NextResponse.json(
        {
          error: (e instanceof Error ? e.message : "회사코드 입력 실패") + ` (현재 URL: ${url})`,
          debug: {
            current_url: url,
            frames: frameHints,
            frame_count: frameHints.length,
            frame_urls: frameHints.map((f) => f.url).slice(0, 10),
            page_text_snippet: pageSnippet,
          },
        },
        { status: 500 }
      );
    }

    await fillFirst(
      loginScopes,
      [
        "#id",
        'input[name="id"]',
        'input[type="text"][autocomplete="username"]',
        'input[placeholder*="아이디"]',
      ],
      USER_ID,
      "아이디"
    );
    await fillFirst(
      loginScopes,
      ["#passwd", 'input[name="passwd"]', 'input[type="password"]'],
      PASSWORD,
      "비밀번호"
    );

    const popupPromise = context.waitForEvent("page", { timeout: 5000 }).catch(() => null);
    await clickFirst(
      loginScopes,
      ["#save", 'button[type="submit"]', 'input[type="submit"]', "text=로그인"],
      "로그인"
    );
    const maybePopup = await popupPromise;
    if (maybePopup) await maybePopup.waitForLoadState("domcontentloaded").catch(() => {});

    await page.waitForTimeout(1800);
    await page.waitForLoadState("networkidle").catch(() => {});

    const activePage = await pickBestPageAfterLogin(
      context as Parameters<typeof pickBestPageAfterLogin>[0],
      page,
      COMPANY
    );
    await activePage.waitForLoadState("networkidle").catch(() => {});

    const currentUrl = activePage.url();
    const isStillLoginPage = isLoginLikeUrl(currentUrl);
    const cookieHints = await collectCookieHints(
      context as Parameters<typeof collectCookieHints>[0]
    );
    const hasEcountCookie = cookieHints.some((c) => c.domain.includes("ecount.com"));

    if (isStillLoginPage) {
      const loginError = await detectLoginError(activePage);
      const frameHints = await collectFrameHints(activePage);
      const pageSnippet = await getPageTextSnippet(activePage);
      const reason = !hasEcountCookie
        ? "로그인 요청이 세션 쿠키로 이어지지 않았습니다."
        : "세션 쿠키는 생성됐지만 앱 화면으로 전환되지 않았습니다.";
      return NextResponse.json(
        {
          error: loginError ?? reason,
          debug: {
            current_url: currentUrl.slice(0, 300),
            frames: frameHints,
            frame_count: frameHints.length,
            frame_urls: frameHints.map((f) => f.url).slice(0, 10),
            page_text_snippet: pageSnippet,
            cookies: cookieHints,
          },
        },
        { status: 500 }
      );
    }

    // ── 2. 재고수불부 이동 (hash 직접 변경) ───────────────
    // goto() 는 SPA hash 변경에 불안정 → evaluate() 로 직접 변경
    const hashParams =
      "menuType=MENUTREE_000004" +
      "&menuSeq=MENUTREE_000215" +
      "&groupSeq=MENUTREE_000035" +
      "&prgId=E040702" +
      "&depth=4";

    await activePage.evaluate((hash: string) => {
      window.location.hash = hash;
    }, hashParams);

    // EC5 SPA 라우터가 hash 처리 + 자식 iframe 로드 대기
    await activePage.waitForTimeout(3500);

    // ── 3. 자식 iframe 대기 ────────────────────────────────
    const ledgerFrame = await waitForContentFrame(activePage, 20000);
    const ledgerScopes = ledgerFrame
      ? [ledgerFrame as LocatorScope, ...getScopes(activePage)]
      : getScopes(activePage);

    // ── 4. 품목코드 입력 ───────────────────────────────────
    await activePage.waitForTimeout(1000);

    try {
      await fillFirst(
        ledgerScopes,
        [
          '[data-cid="txtSProdCd"][data-index="0"]',
          '[data-cid="txtSProdCd"]',
          'input[data-cid*="ProdCd"]',
          'input[id*="ProdCd"]',
          'input[name*="ProdCd"]',
          'input[placeholder*="품목코드"]',
          'input[placeholder*="품목"]',
          'input[aria-label*="품목"]',
        ],
        item_code,
        "품목코드"
      );
    } catch (e) {
      const url = activePage.url().slice(0, 300);
      const frameHints = await collectFrameHints(activePage);
      const pageSnippet = await getPageTextSnippet(activePage);
      return NextResponse.json(
        {
          error: (e instanceof Error ? e.message : "품목코드 입력 실패") + ` (현재 URL: ${url})`,
          debug: {
            current_url: url,
            frames: frameHints,
            frame_count: frameHints.length,
            frame_urls: frameHints.map((f) => f.url).slice(0, 10),
            page_text_snippet: pageSnippet,
            has_ledger_frame: Boolean(ledgerFrame),
            ledger_frame_url: ledgerFrame?.url() ?? null,
          },
        },
        { status: 500 }
      );
    }

    // ── 5. 날짜 입력 ───────────────────────────────────────
    const [fromY, fromM, fromD] = date_from.split("-");
    const [toY, toM, toD] = date_to.split("-");
    const dateScope = ledgerFrame ?? activePage;

    await dateScope.click('[data-cid="ddlSYear_DATE"][data-index="0"]');
    await dateScope.click(`li[data-value="${fromY}"]`);
    await dateScope.click('[data-cid="ddlSYear_DATE"][data-index="1"]');
    await dateScope.click(`li[data-value="${fromM}"]`);
    await dateScope.fill('[data-cid="ddlSYear_DATE"][data-index="2"]', fromD);
    await dateScope.click('[data-cid="ddlSYear_DATE"][data-index="3"]');
    await dateScope.click(`li[data-value="${toY}"]`);
    await dateScope.click('[data-cid="ddlSYear_DATE"][data-index="4"]');
    await dateScope.click(`li[data-value="${toM}"]`);
    await dateScope.fill('[data-cid="ddlSYear_DATE"][data-index="5"]', toD);

    // ── 6. 조회 ────────────────────────────────────────────
    await clickFirst(ledgerScopes, ["#search", '[data-cid="search"]', "text=조회"], "조회");
    await activePage.waitForLoadState("networkidle").catch(() => {});
    await activePage.waitForTimeout(1500);

    // ── 7. 엑셀 다운로드 ───────────────────────────────────
    const excelSelectors = [
      '[data-cid="excel"]',
      '[data-cid="btnExcel"]',
      '[data-cid*="Excel"]',
      'button:has-text("Excel")',
      'button:has-text("엑셀")',
      'a:has-text("Excel")',
      'a:has-text("엑셀")',
      'button[title*="Excel"]',
      "#excel",
      "#btnExcel",
      ".btn-excel",
      'button[onclick*="excel" i]',
    ];

    let excelClicked = false;
    const tryClickExcel = async () => {
      for (const scope of ledgerScopes) {
        for (const sel of excelSelectors) {
          try {
            const loc = scope.locator(sel).first();
            if ((await loc.count()) > 0) {
              await loc.click({ timeout: 3000 });
              excelClicked = true;
              return;
            }
          } catch {
            /* 다음 시도 */
          }
        }
      }
    };

    let download: Download | null = null;
    try {
      const [dl] = await Promise.all([
        activePage.waitForEvent("download", { timeout: 15000 }),
        tryClickExcel(),
      ]);
      download = dl;
    } catch {
      /* 아래에서 처리 */
    }

    // download → buffer 변환
    const buffer = download
      ? await download.createReadStream().then(
          (stream) =>
            new Promise<Buffer>((res, rej) => {
              const chunks: Buffer[] = [];
              stream.on("data", (c) => chunks.push(c));
              stream.on("end", () => res(Buffer.concat(chunks)));
              stream.on("error", rej);
            })
        )
      : null;

    if (!download || !excelClicked || !buffer) {
      // 디버그: 현재 화면의 모든 버튼 정보 수집
      const allButtons: Array<Record<string, string | null>> = [];
      for (const f of [activePage as LocatorScope, ...activePage.frames()]) {
        try {
          const btns = await (f as Frame).evaluate(() =>
            Array.from(document.querySelectorAll("button, a, span[onclick], div[onclick]"))
              .slice(0, 60)
              .map((el: Element) => ({
                tag: el.tagName,
                id: (el as HTMLElement).id || null,
                text: (el as HTMLElement).innerText?.trim().slice(0, 40) || null,
                dataCid: el.getAttribute("data-cid") || null,
                title: el.getAttribute("title") || null,
              }))
          );
          allButtons.push(...btns);
        } catch {
          /* cross-origin */
        }
      }
      const url = activePage.url().slice(0, 300);
      const frameHints = await collectFrameHints(activePage);
      return NextResponse.json(
        {
          error: `엑셀 다운로드 버튼을 찾지 못했습니다. (현재 URL: ${url})`,
          debug: {
            current_url: url,
            frames: frameHints,
            frame_count: frameHints.length,
            frame_urls: frameHints.map((f) => f.url).slice(0, 10),
            has_ledger_frame: Boolean(ledgerFrame),
            ledger_frame_url: ledgerFrame?.url() ?? null,
            all_buttons: allButtons.filter((b) => b.text || b.dataCid || b.id),
          },
        },
        { status: 500 }
      );
    }

    // ── 8. 엑셀 파싱 ───────────────────────────────────────
    // 이카운트 재고수불부 엑셀 구조:
    //   1행: 제목(회사명/기간) — 헤더 아님
    //   2행: 실제 헤더 (일자, 거래처명, 적요, 입고수량, 출고수량, 재고수량)
    //   3행~: 데이터 + 전일재고/합계/계/타임스탬프 행 포함
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json<RawXlsxRow>(sheet, {
      defval: "",
      range: 1, // 1행 제목 스킵, 2행을 헤더로 사용
    });

    const parsed = rawRows
      .filter((r) => {
        const date = String(r["일자"] ?? "").trim();
        if (!date) return false;
        if (date === "전일재고") return false;
        if (/계$|합계/.test(date)) return false;
        if (/오전|오후|\d{2}:\d{2}/.test(date)) return false;
        return true;
      })
      .map((r) => ({
        date: String(r["일자"]).trim().replace(/\//g, "-").trim(),
        counterparty: String(r["거래처명"] ?? "").trim(),
        note: String(r["적요"] ?? "").trim(),
        in_qty: Number(r["입고수량"] ?? 0) || 0,
        out_qty: Number(r["출고수량"] ?? 0) || 0,
        stock_qty: Number(r["재고수량"] ?? 0) || 0,
      }));

    // ── 9. Supabase upsert (신 스키마 — HANDOVER v6 정책 준수) ───────
    // 구 items 자동 생성 로직 제거 → item_erp_mapping에서 item_id 조회 (144 불변 원칙)
    // 구 transactions upsert 제거 → orders insert (UNIQUE: erp_system, erp_tx_no, erp_tx_line_no)
    const supabase = await createClient();

    // erp_code로 144 마스터의 item_id 역매칭 (HANDOVER v6 SQL 스니펫 참조)
    const { data: mappingRow, error: mappingErr } = await supabase
      .from("item_erp_mapping")
      .select("item_id, erp_system")
      .eq("erp_code", item_code)
      .order("erp_system", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (mappingErr) throw new Error(`item_erp_mapping 조회 실패: ${mappingErr.message}`);

    if (!mappingRow) {
      return NextResponse.json(
        {
          error: `ERP 코드 "${item_code}"가 item_erp_mapping에 등록되지 않았습니다.`,
          hint: "144개 마스터 품목에 매핑되지 않은 코드는 적재할 수 없습니다 (HANDOVER v6 원칙 3번). PM에게 매핑 등록을 요청하세요.",
        },
        { status: 422 }
      );
    }

    const resolvedItemId = mappingRow.item_id;
    const erpSystem = mappingRow.erp_system;

    // orders 행 생성 — 같은 (date, counterparty)가 erp_tx_no, idx로 line_no 부여
    type OrderInsert = {
      item_id: number;
      tx_date: string;
      tx_type: string;
      erp_system: string;
      erp_code: string;
      erp_tx_no: string;
      erp_tx_line_no: number;
      counterparty: string | null;
      memo: string | null;
      quantity: number;
    };

    const orderRows: OrderInsert[] = parsed.flatMap((row, idx) => {
      const txNo = `ECOUNT_${row.date}_${row.counterparty || "UNKNOWN"}`;
      const out: OrderInsert[] = [];
      if (row.in_qty > 0) {
        out.push({
          item_id: resolvedItemId,
          tx_date: row.date,
          tx_type: "purchase",
          erp_system: erpSystem,
          erp_code: item_code,
          erp_tx_no: txNo,
          erp_tx_line_no: idx * 2 + 1,
          counterparty: row.counterparty || null,
          memo: row.note || null,
          quantity: row.in_qty,
        });
      }
      if (row.out_qty > 0) {
        out.push({
          item_id: resolvedItemId,
          tx_date: row.date,
          tx_type: "sale",
          erp_system: erpSystem,
          erp_code: item_code,
          erp_tx_no: txNo,
          erp_tx_line_no: idx * 2 + 2,
          counterparty: row.counterparty || null,
          memo: row.note || null,
          quantity: row.out_qty,
        });
      }
      return out;
    });

    if (CRAWL_DRY_RUN) {
      return NextResponse.json({
        success: true,
        dry_run: true,
        rows: parsed.slice(0, 20),
        saved_count: orderRows.length,
        item_id: resolvedItemId,
        erp_system: erpSystem,
        message: `DRY RUN 성공: ${orderRows.length}건 추출됨 (DB 저장 안 함)`,
      });
    }

    const { error: upsertErr } = await supabase.from("orders").upsert(orderRows, {
      onConflict: "erp_system,erp_tx_no,erp_tx_line_no",
      ignoreDuplicates: true,
    });

    if (upsertErr) throw new Error(upsertErr.message);

    return NextResponse.json({
      success: true,
      dry_run: false,
      rows: parsed,
      saved_count: orderRows.length,
      item_id: resolvedItemId,
      erp_system: erpSystem,
      message: `${orderRows.length}건 저장 완료 (item_id: ${resolvedItemId}, system: ${erpSystem})`,
    });
  } catch (e: unknown) {
    const url = page.url().slice(0, 300);
    const message = e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.";
    return NextResponse.json({ error: `${message} (현재 URL: ${url})` }, { status: 500 });
  } finally {
    await browser.close();
  }
}
