/**
 * 엑셀/CSV 공통 파싱 유틸 (숫자·날짜 정규화)
 */

/** 쉼표·공백 제거 후 숫자, 빈 값은 null */
export function parseNumberKo(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const s = String(raw).trim();
  if (!s || s === "-" || s === "—") return null;
  const n = Number(s.replace(/,/g, "").replace(/\s/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** YYYYMMDD(문자/숫자) → YYYY-MM-DD */
export function yyyymmddToIso(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).replace(/\D/g, "").trim();
  if (s.length === 8) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  return null;
}

/** 2024.10.15 / 2025/12/04 / Date 객체 → YYYY-MM-DD */
export function normalizeDateCell(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, "0");
    const d = String(raw.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(raw).trim();
  if (!s) return null;
  const ymd = yyyymmddToIso(s);
  if (ymd) return ymd;
  const dot = /^(\d{4})\.(\d{1,2})\.(\d{1,2})/.exec(s);
  if (dot) {
    const y = dot[1];
    const m = String(Number(dot[2])).padStart(2, "0");
    const d = String(Number(dot[3])).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const slash = /^(\d{4})\/(\d{1,2})\/(\d{1,2})/.exec(s);
  if (slash) {
    const y = slash[1];
    const m = String(Number(slash[2])).padStart(2, "0");
    const d = String(Number(slash[3])).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (iso) return iso[1] ?? null;
  return null;
}

/** yearMonth YYYY-MM */
export function yearMonthFromIsoDate(iso: string): string {
  return iso.slice(0, 7);
}

/** 합계·소계 행 판별 */
export function isSummaryRowLabel(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return /^(합계|소계|총계|Total|Subtotal)/i.test(t);
}
