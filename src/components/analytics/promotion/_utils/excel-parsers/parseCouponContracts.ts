/**
 * 쿠폰 계약 coupon_*.xls (HTML 테이블 위장) 또는 진짜 xlsx → promotion_coupon_contracts (계약 단위 집계)
 */
import * as XLSX from "xlsx";
import type { InsertTables } from "@/lib/supabase/types";
import { parseNumberKo } from "@/lib/excel-parsers/parsingUtils";

export type ParsedCouponContractRow = InsertTables<"promotion_coupon_contracts"> & {
  is_baseline: false;
};

type CouponAgg = {
  contract_no: number;
  start_date: string;
  end_date: string;
  budget: number | null;
  paid_sum: number;
};

function parseHtmlTableCoupon(fileText: string): ParsedCouponContractRow[] {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    throw new Error("쿠폰 HTML 형식은 브라우저에서만 처리할 수 있습니다.");
  }
  const doc = new DOMParser().parseFromString(fileText, "text/html");
  const table = doc.querySelector("table");
  if (!table) {
    throw new Error(
      "쿠폰 파일에서 표를 찾을 수 없습니다. 허브에서 내려받은 원본 형식인지 확인해 주세요."
    );
  }
  const trs = table.querySelectorAll("tr");
  if (trs.length < 2) throw new Error("쿠폰 표에 데이터가 없습니다.");

  const headerCells = trs[0]!.querySelectorAll("th,td");
  const headers = [...headerCells].map((c) => c.textContent?.trim() ?? "");
  const idx = (name: string) =>
    headers.findIndex((h) => h === name || h.replace(/\s/g, "") === name.replace(/\s/g, ""));

  const iNo = idx("계약서NO");
  const iStart = idx("계약기간시작");
  const iEnd = idx("계약기간종료");
  const iBudget = idx("계약서 판촉비");
  const iFund = idx("펀딩 금액");
  if (iNo < 0 || iStart < 0 || iEnd < 0) {
    throw new Error("쿠폰 표 필수 열(계약서NO, 계약기간시작, 계약기간종료)을 찾을 수 없습니다.");
  }

  const map = new Map<number, CouponAgg>();

  for (let r = 1; r < trs.length; r++) {
    const cells = [...trs[r]!.querySelectorAll("td,th")].map((c) => c.textContent?.trim() ?? "");
    if (!cells.length) continue;
    const noRaw = cells[iNo] ?? "";
    const contractNo = Number(String(noRaw).replace(/\D/g, ""));
    if (!Number.isFinite(contractNo) || contractNo <= 0) continue;

    const start = (cells[iStart] ?? "").slice(0, 10);
    const end = (cells[iEnd] ?? "").slice(0, 10);
    const fund = parseNumberKo(iFund >= 0 ? cells[iFund] : null) ?? 0;
    const budgetCell = iBudget >= 0 ? cells[iBudget] : null;
    const budgetNum = parseNumberKo(budgetCell);

    const prev = map.get(contractNo);
    if (!prev) {
      map.set(contractNo, {
        contract_no: contractNo,
        start_date: start,
        end_date: end,
        budget: budgetNum,
        paid_sum: fund,
      });
    } else {
      prev.paid_sum += fund;
      if (budgetNum != null && (prev.budget == null || budgetNum > prev.budget))
        prev.budget = budgetNum;
      if (start && start < prev.start_date) prev.start_date = start;
      if (end && end > prev.end_date) prev.end_date = end;
    }
  }

  const out: ParsedCouponContractRow[] = [];
  for (const a of map.values()) {
    out.push({
      contract_no: a.contract_no,
      start_date: a.start_date || null,
      end_date: a.end_date || null,
      budget: a.budget,
      paid_amount: a.paid_sum,
      coupon_name: null,
      coupon_category: null,
      season: null,
      is_baseline: false,
    });
  }
  if (!out.length) throw new Error("집계된 쿠폰 계약이 없습니다.");
  return out;
}

function parseXlsxCoupon(buf: ArrayBuffer): ParsedCouponContractRow[] {
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]!];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  if (!rows.length) throw new Error("시트에 데이터가 없습니다.");

  const map = new Map<number, CouponAgg>();

  const aliases = {
    no: ["계약서NO", "계약서번호", "계약서 No"],
    start: ["계약기간시작", "계약 시작일"],
    end: ["계약기간종료", "계약 종료일"],
    budget: ["계약서 판촉비", "판촉비"],
    fund: ["펀딩 금액", "부담금액"],
  };

  const pick = (row: Record<string, unknown>, keys: string[]) => {
    for (const k of keys) {
      if (row[k] !== undefined && row[k] !== "") return row[k];
    }
    for (const key of Object.keys(row)) {
      for (const k of keys) {
        if (key.replace(/\s/g, "") === k.replace(/\s/g, "")) return row[key];
      }
    }
    return undefined;
  };

  for (const raw of rows) {
    const row = raw as Record<string, unknown>;
    const noRaw = pick(row, aliases.no);
    const contractNo = Number(String(noRaw ?? "").replace(/\D/g, ""));
    if (!Number.isFinite(contractNo) || contractNo <= 0) continue;
    const start = String(pick(row, aliases.start) ?? "").slice(0, 10);
    const end = String(pick(row, aliases.end) ?? "").slice(0, 10);
    const fund = parseNumberKo(pick(row, aliases.fund)) ?? 0;
    const budgetNum = parseNumberKo(pick(row, aliases.budget));

    const prev = map.get(contractNo);
    if (!prev) {
      map.set(contractNo, {
        contract_no: contractNo,
        start_date: start,
        end_date: end,
        budget: budgetNum,
        paid_sum: fund,
      });
    } else {
      prev.paid_sum += fund;
      if (budgetNum != null && (prev.budget == null || budgetNum > prev.budget))
        prev.budget = budgetNum;
      if (start && start < prev.start_date) prev.start_date = start;
      if (end && end > prev.end_date) prev.end_date = end;
    }
  }

  const out: ParsedCouponContractRow[] = [];
  for (const a of map.values()) {
    out.push({
      contract_no: a.contract_no,
      start_date: a.start_date || null,
      end_date: a.end_date || null,
      budget: a.budget,
      paid_amount: a.paid_sum,
      coupon_name: null,
      coupon_category: null,
      season: null,
      is_baseline: false,
    });
  }
  if (!out.length) throw new Error("집계된 쿠폰 계약이 없습니다.");
  return out;
}

export async function parseCouponContracts(file: File): Promise<ParsedCouponContractRow[]> {
  const buf = await file.arrayBuffer();
  const head = new Uint8Array(buf.slice(0, 64));
  const asText = new TextDecoder("utf-8", { fatal: false }).decode(head).trimStart();
  if (asText.startsWith("<") || asText.startsWith("\ufeff<")) {
    const text = new TextDecoder("utf-8").decode(buf);
    return parseHtmlTableCoupon(text);
  }
  return parseXlsxCoupon(buf);
}
