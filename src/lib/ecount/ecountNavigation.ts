import type { Frame, Page } from "playwright";

import {
  clickFirst,
  collectFrameHints,
  fillFirst,
  getPageTextSnippet,
  getScopes,
} from "./playwright-helpers";
import { EcountFilterError, type LocatorScope } from "./types";

/**
 * waitForContentFrame: mainFrame() 은 반드시 제외하고,
 * ecount.com 도메인의 자식 iframe이 나타날 때까지 최대 timeoutMs 폴링
 */
export async function waitForContentFrame(page: Page, timeoutMs = 20000): Promise<Frame | null> {
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

export type LedgerFilters = {
  itemCode: string;
  dateFrom: string; // YYYY-MM-DD
  dateTo: string; // YYYY-MM-DD
};

export type LedgerScopesResult = {
  ledgerFrame: Frame | null;
  ledgerScopes: LocatorScope[];
};

/**
 * 재고수불부 메뉴 이동 → 품목코드/날짜 필터 입력 → 조회 클릭
 * - 품목코드 입력 실패 → EcountFilterError (has_ledger_frame / ledger_frame_url 포함)
 * - 날짜 입력/조회 클릭 실패 → 원본 Error bubble-up (route.ts 최상위 catch)
 */
export async function openLedgerAndFillFilters(
  activePage: Page,
  filters: LedgerFilters
): Promise<LedgerScopesResult> {
  // 재고수불부 이동 (hash 직접 변경) — goto() 는 SPA hash 변경에 불안정
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

  const ledgerFrame = await waitForContentFrame(activePage, 20000);
  const ledgerScopes: LocatorScope[] = ledgerFrame
    ? [ledgerFrame, ...getScopes(activePage)]
    : getScopes(activePage);

  // 품목코드 입력
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
      filters.itemCode,
      "품목코드"
    );
  } catch (e) {
    const url = activePage.url().slice(0, 300);
    const frameHints = await collectFrameHints(activePage);
    const pageSnippet = await getPageTextSnippet(activePage);
    throw new EcountFilterError(
      (e instanceof Error ? e.message : "품목코드 입력 실패") + ` (현재 URL: ${url})`,
      {
        current_url: url,
        frames: frameHints,
        frame_count: frameHints.length,
        frame_urls: frameHints.map((f) => f.url).slice(0, 10),
        page_text_snippet: pageSnippet,
        has_ledger_frame: Boolean(ledgerFrame),
        ledger_frame_url: ledgerFrame?.url() ?? null,
      }
    );
  }

  // 날짜 입력
  const [fromY, fromM, fromD] = filters.dateFrom.split("-");
  const [toY, toM, toD] = filters.dateTo.split("-");
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

  // 조회
  await clickFirst(ledgerScopes, ["#search", '[data-cid="search"]', "text=조회"], "조회");
  await activePage.waitForLoadState("networkidle").catch(() => {});
  await activePage.waitForTimeout(1500);

  return { ledgerFrame, ledgerScopes };
}
