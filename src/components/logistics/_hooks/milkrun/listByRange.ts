import { isMissingRelationError, normalizeYmd, ymdFromDb } from "./internals";
import {
  T_ALLOC,
  type DbAllocation,
  type MilkrunDailyRow,
  type MilkrunHistoryRecord,
  type MilkrunHistorySummary,
  type SupabaseBrowserClient,
} from "./types";

export async function listByRange(
  supabase: SupabaseBrowserClient,
  start: string,
  end: string
): Promise<
  | {
      ok: true;
      summary: MilkrunHistorySummary;
      records: MilkrunHistoryRecord[];
      daily: MilkrunDailyRow[];
    }
  | { ok: false; message: string; missingTable: boolean }
> {
  const s = normalizeYmd(start);
  const e = normalizeYmd(end);
  if (!s || !e) {
    return {
      ok: false,
      message: "시작일·종료일(YYYY-MM-DD)이 필요합니다.",
      missingTable: false,
    };
  }

  const { data: rows, error } = await supabase
    .from(T_ALLOC)
    .select("*")
    .gte("order_date", s)
    .lte("order_date", e)
    .order("order_date", { ascending: false });

  if (error) {
    const msg = error.message;
    return {
      ok: false,
      message: msg,
      missingTable: isMissingRelationError(msg),
    };
  }

  const list = (rows ?? []) as DbAllocation[];
  const records: MilkrunHistoryRecord[] = list.map((r) => ({
    id: r.id,
    orderDate: ymdFromDb(r.order_date),
    totalCost: r.total_cost,
    totalPallets: r.total_pallets,
    centerCount: r.center_count,
    memo: r.memo,
    createdAt: r.created_at,
  }));

  const summary: MilkrunHistorySummary = {
    count: records.length,
    totalCost: records.reduce((acc, r) => acc + r.totalCost, 0),
    totalPallets: records.reduce((acc, r) => acc + r.totalPallets, 0),
    avgCostPerRecord:
      records.length > 0
        ? Math.round(records.reduce((acc, r) => acc + r.totalCost, 0) / records.length)
        : 0,
  };

  const byDate = new Map<string, { cost: number; pallets: number }>();
  for (const r of list) {
    const d = ymdFromDb(r.order_date);
    const prev = byDate.get(d) ?? { cost: 0, pallets: 0 };
    byDate.set(d, {
      cost: prev.cost + r.total_cost,
      pallets: prev.pallets + r.total_pallets,
    });
  }
  const daily: MilkrunDailyRow[] = [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, v]) => ({ date, cost: v.cost, pallets: v.pallets }));

  return { ok: true, summary, records, daily };
}
