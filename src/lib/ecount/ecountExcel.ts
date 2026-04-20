import type { Download, Frame, Page } from "playwright";
import * as XLSX from "xlsx";

import { collectFrameHints } from "./playwright-helpers";
import {
  EcountExcelError,
  type ExcelButtonHint,
  type LocatorScope,
  type ParsedLedgerRow,
  type RawXlsxRow,
} from "./types";

const EXCEL_SELECTORS = [
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

/**
 * 엑셀 다운로드 버튼 클릭 → 파일 다운로드 → XLSX 파싱 → ParsedLedgerRow[]
 * 실패 시 EcountExcelError (all_buttons / has_ledger_frame / ledger_frame_url 포함)
 *
 * 이카운트 재고수불부 엑셀 구조:
 *   1행: 제목(회사명/기간) — 헤더 아님
 *   2행: 실제 헤더 (일자, 거래처명, 적요, 입고수량, 출고수량, 재고수량)
 *   3행~: 데이터 + 전일재고/합계/계/타임스탬프 행 포함
 */
export async function downloadAndParseLedger(
  activePage: Page,
  ledgerFrame: Frame | null,
  ledgerScopes: LocatorScope[]
): Promise<ParsedLedgerRow[]> {
  let excelClicked = false;
  const tryClickExcel = async (): Promise<void> => {
    for (const scope of ledgerScopes) {
      for (const sel of EXCEL_SELECTORS) {
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
    const allButtons: ExcelButtonHint[] = [];
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
    throw new EcountExcelError(`엑셀 다운로드 버튼을 찾지 못했습니다. (현재 URL: ${url})`, {
      current_url: url,
      frames: frameHints,
      frame_count: frameHints.length,
      frame_urls: frameHints.map((f) => f.url).slice(0, 10),
      has_ledger_frame: Boolean(ledgerFrame),
      ledger_frame_url: ledgerFrame?.url() ?? null,
      all_buttons: allButtons.filter((b) => b.text || b.dataCid || b.id),
    });
  }

  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<RawXlsxRow>(sheet, {
    defval: "",
    range: 1, // 1행 제목 스킵, 2행을 헤더로 사용
  });

  const parsed: ParsedLedgerRow[] = rawRows
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

  return parsed;
}
