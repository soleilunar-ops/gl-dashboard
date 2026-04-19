import { computeAllocations } from "@/lib/milkrun-compute";

import { isMissingRelationError, normalizeYmd, ymdFromDb } from "./internals";
import {
  T_ALLOC,
  T_ITEMS,
  type DbAllocation,
  type DbAllocationItem,
  type MilkrunExportLine,
  type SupabaseBrowserClient,
} from "./types";

/** 기간 내 배정·센터 라인을 한 번에 불러와 CSV용으로 평탄화합니다. */
export async function listLinesForCsvExport(
  supabase: SupabaseBrowserClient,
  start: string,
  end: string
): Promise<
  { ok: true; lines: MilkrunExportLine[] } | { ok: false; message: string; missingTable: boolean }
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
    .order("order_date", { ascending: false })
    .order("id", { ascending: false });

  if (error) {
    const msg = error.message;
    return { ok: false, message: msg, missingTable: isMissingRelationError(msg) };
  }

  const allocList = (rows ?? []) as DbAllocation[];
  if (allocList.length === 0) {
    return { ok: true, lines: [] };
  }

  const ids = allocList.map((a) => a.id);
  const { data: itemRows, error: errItems } = await supabase
    .from(T_ITEMS)
    .select("*")
    .in("allocation_id", ids);

  if (errItems) {
    const msg = errItems.message;
    return { ok: false, message: msg, missingTable: isMissingRelationError(msg) };
  }

  const rawItems = (itemRows ?? []) as DbAllocationItem[];
  const byParent = new Map<number, DbAllocationItem[]>();
  for (const it of rawItems) {
    const g = byParent.get(it.allocation_id) ?? [];
    g.push(it);
    byParent.set(it.allocation_id, g);
  }

  const lines: MilkrunExportLine[] = [];
  for (const a of allocList) {
    const group = byParent.get(a.id) ?? [];
    const inputs = group.map((i) => ({
      name: i.center_name,
      basic: i.basic_price,
      pallets: i.pallet_count,
    }));
    const computed = computeAllocations(inputs);
    for (const r of computed.rows) {
      lines.push({
        allocationId: a.id,
        orderDate: ymdFromDb(a.order_date),
        createdAt: a.created_at,
        memo: a.memo,
        centerName: r.name,
        basicPrice: r.basic,
        palletCount: r.pallets,
        lineCost: r.cost,
        sharePct: Math.round(r.sharePct * 10) / 10,
      });
    }
  }

  return { ok: true, lines };
}
