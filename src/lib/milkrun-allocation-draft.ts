// 변경 이유: 비용 계산기 배정 상태를 새로고침 후에도 유지하기 위한 localStorage 초안 저장입니다.
const STORAGE_KEY = "milkrun-allocation-draft-v1";

export interface MilkrunDraftRow {
  name: string;
  basic: number;
  pallets: number;
}

export interface MilkrunDraftState {
  rows: MilkrunDraftRow[];
}

export function loadAllocationDraft(): MilkrunDraftState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const rowsUnknown = (parsed as { rows?: unknown }).rows;
    if (!Array.isArray(rowsUnknown)) return null;
    const rows: MilkrunDraftRow[] = [];
    for (const item of rowsUnknown) {
      if (!item || typeof item !== "object") continue;
      const r = item as Record<string, unknown>;
      if (
        typeof r.name !== "string" ||
        typeof r.basic !== "number" ||
        typeof r.pallets !== "number"
      )
        continue;
      rows.push({
        name: r.name,
        basic: Math.round(r.basic),
        pallets: Math.max(0, Math.round(r.pallets)),
      });
    }
    return { rows };
  } catch {
    return null;
  }
}

export function saveAllocationDraft(state: MilkrunDraftState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
