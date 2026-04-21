import { isMissingRelationError, normalizeItemsForInsert, normalizeYmd } from "./internals";
import { T_ALLOC, T_ITEMS, type MilkrunSaveLineInput, type SupabaseBrowserClient } from "./types";

export async function saveAllocation(
  supabase: SupabaseBrowserClient,
  orderDateRaw: string,
  memo: string | null,
  lines: MilkrunSaveLineInput[]
): Promise<{ ok: true; id: number } | { ok: false; message: string; missingTable?: boolean }> {
  const orderDate = normalizeYmd(orderDateRaw);
  if (!orderDate) {
    return { ok: false, message: "출고일(YYYY-MM-DD)이 필요합니다." };
  }
  const normalized = normalizeItemsForInsert(lines);
  if (normalized.length === 0) {
    return { ok: false, message: "유효한 배정 행이 없습니다." };
  }
  const totalCost = normalized.reduce((s, i) => s + i.lineCost, 0);
  const totalPallets = normalized.reduce((s, i) => s + i.palletCount, 0);
  const centerCount = normalized.length;

  const memoTrimmed = memo?.trim() ? memo.trim() : null;

  const { data: parent, error: insErr } = await supabase
    .from(T_ALLOC)
    .insert({
      order_date: orderDate,
      total_cost: totalCost,
      total_pallets: totalPallets,
      center_count: centerCount,
      memo: memoTrimmed,
    } as never)
    .select("id")
    .single();

  const row = parent as { id: number } | null;
  if (insErr || !row) {
    const msg = insErr?.message ?? "저장에 실패했습니다.";
    return {
      ok: false,
      message: msg,
      missingTable: isMissingRelationError(msg),
    };
  }

  const childPayload = normalized.map((i) => ({
    allocation_id: row.id,
    center_name: i.centerName,
    basic_price: i.basicPrice,
    pallet_count: i.palletCount,
    line_cost: i.lineCost,
  }));

  const { error: childErr } = await supabase.from(T_ITEMS).insert(childPayload as never);
  if (childErr) {
    await supabase.from(T_ALLOC).delete().eq("id", row.id);
    const msg = childErr.message ?? "라인 저장에 실패했습니다.";
    return {
      ok: false,
      message: msg,
      missingTable: isMissingRelationError(msg),
    };
  }

  return { ok: true, id: row.id };
}
