import { computeAllocations } from "@/lib/milkrun-compute";

import { isMissingRelationError, ymdFromDb } from "./internals";
import {
  T_ALLOC,
  T_ITEMS,
  type DbAllocation,
  type DbAllocationItem,
  type MilkrunDetail,
  type SupabaseBrowserClient,
} from "./types";

export async function getDetail(
  supabase: SupabaseBrowserClient,
  id: number
): Promise<
  { ok: true; detail: MilkrunDetail } | { ok: false; message: string; missingTable: boolean }
> {
  if (!Number.isFinite(id) || id <= 0) {
    return { ok: false, message: "유효하지 않은 id입니다.", missingTable: false };
  }

  const { data: row, error: errAlloc } = await supabase
    .from(T_ALLOC)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (errAlloc) {
    const msg = errAlloc.message;
    return { ok: false, message: msg, missingTable: isMissingRelationError(msg) };
  }

  const pack = row as DbAllocation | null;
  if (!pack) {
    return { ok: false, message: "데이터를 찾을 수 없습니다.", missingTable: false };
  }

  const { data: itemRows, error: errItems } = await supabase
    .from(T_ITEMS)
    .select("*")
    .eq("allocation_id", id);

  if (errItems) {
    const msg = errItems.message;
    return { ok: false, message: msg, missingTable: isMissingRelationError(msg) };
  }

  const itemsRaw = (itemRows ?? []) as DbAllocationItem[];
  const inputs = itemsRaw.map((i) => ({
    name: i.center_name,
    basic: i.basic_price,
    pallets: i.pallet_count,
  }));
  const computed = computeAllocations(inputs);

  const detail: MilkrunDetail = {
    id: pack.id,
    orderDate: ymdFromDb(pack.order_date),
    totalCost: pack.total_cost,
    totalPallets: pack.total_pallets,
    centerCount: pack.center_count,
    memo: pack.memo,
    createdAt: pack.created_at,
    items: computed.rows.map((r) => ({
      centerName: r.name,
      basicPrice: r.basic,
      palletCount: r.pallets,
      lineCost: r.cost,
      sharePct: Math.round(r.sharePct * 10) / 10,
    })),
  };

  return { ok: true, detail };
}
