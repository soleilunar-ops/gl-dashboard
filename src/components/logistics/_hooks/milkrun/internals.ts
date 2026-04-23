import type { MilkrunSaveLineInput } from "./types";

export function normalizeYmd(value: string): string | null {
  const t = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

export function ymdFromDb(value: string): string {
  return value.slice(0, 10);
}

export function isMissingRelationError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache");
}

/** API 라우트와 동일하게 라인·총합을 정규화합니다. */
export function normalizeItemsForInsert(
  raw: MilkrunSaveLineInput[]
): Array<{ centerName: string; basicPrice: number; palletCount: number; lineCost: number }> {
  const out: Array<{
    centerName: string;
    basicPrice: number;
    palletCount: number;
    lineCost: number;
  }> = [];
  for (const row of raw) {
    const centerName = row.centerName.trim();
    const basicPrice = Math.floor(Number(row.basicPrice));
    const palletCount = Math.floor(Number(row.palletCount));
    if (!centerName || !Number.isFinite(basicPrice) || basicPrice < 0) continue;
    if (!Number.isFinite(palletCount) || palletCount < 0) continue;
    const lineCost = basicPrice * palletCount;
    out.push({ centerName, basicPrice, palletCount, lineCost });
  }
  return out;
}
