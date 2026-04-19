// 변경 이유: 리드타임과 같이 Supabase 클라이언트로 밀크런 배정을 저장·조회합니다.
"use client";

import { useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { computeAllocations } from "@/lib/milkrun-compute";

/** DB allocations 행 (types 미반영 시 수동 정의) */
type DbAllocation = {
  id: number;
  order_date: string;
  total_cost: number;
  total_pallets: number;
  center_count: number;
  memo: string | null;
  created_at: string;
  updated_at: string;
};

/** DB allocation_items 행 */
type DbAllocationItem = {
  id: number;
  allocation_id: number;
  center_name: string;
  basic_price: number;
  pallet_count: number;
  line_cost: number;
};

const T_ALLOC = "allocations" as never;
const T_ITEMS = "allocation_items" as never;

export type MilkrunSaveLineInput = {
  centerName: string;
  basicPrice: number;
  palletCount: number;
};

export type MilkrunHistorySummary = {
  count: number;
  totalCost: number;
  totalPallets: number;
  avgCostPerRecord: number;
};

export type MilkrunHistoryRecord = {
  id: number;
  orderDate: string;
  totalCost: number;
  totalPallets: number;
  centerCount: number;
  memo: string | null;
  createdAt: string;
};

export type MilkrunDailyRow = {
  date: string;
  cost: number;
  pallets: number;
};

export type MilkrunDetailItem = {
  centerName: string;
  basicPrice: number;
  palletCount: number;
  lineCost: number;
  sharePct: number;
};

export type MilkrunDetail = {
  id: number;
  orderDate: string;
  totalCost: number;
  totalPallets: number;
  centerCount: number;
  memo: string | null;
  createdAt: string;
  items: MilkrunDetailItem[];
};

/** 기간 CSV: 배정 1건당 센터별로 한 줄 */
export type MilkrunExportLine = {
  allocationId: number;
  orderDate: string;
  createdAt: string;
  memo: string | null;
  centerName: string;
  basicPrice: number;
  palletCount: number;
  lineCost: number;
  sharePct: number;
};

function normalizeYmd(value: string): string | null {
  const t = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

function ymdFromDb(value: string): string {
  return value.slice(0, 10);
}

function isMissingRelationError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("does not exist") || m.includes("schema cache");
}

/** API 라우트와 동일하게 라인·총합을 정규화합니다. */
function normalizeItemsForInsert(
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

export function useMilkrunAllocations() {
  const supabase = useMemo(() => createClient(), []);

  const saveAllocation = useCallback(
    async (
      orderDateRaw: string,
      memo: string | null,
      lines: MilkrunSaveLineInput[]
    ): Promise<
      { ok: true; id: number } | { ok: false; message: string; missingTable?: boolean }
    > => {
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
    },
    [supabase]
  );

  const listByRange = useCallback(
    async (
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
    > => {
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
    },
    [supabase]
  );

  /** 기간 내 배정·센터 라인을 한 번에 불러와 CSV용으로 평탄화합니다. */
  const listLinesForCsvExport = useCallback(
    async (
      start: string,
      end: string
    ): Promise<
      | { ok: true; lines: MilkrunExportLine[] }
      | { ok: false; message: string; missingTable: boolean }
    > => {
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
    },
    [supabase]
  );

  const getDetail = useCallback(
    async (
      id: number
    ): Promise<
      { ok: true; detail: MilkrunDetail } | { ok: false; message: string; missingTable: boolean }
    > => {
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
    },
    [supabase]
  );

  const remove = useCallback(
    async (
      id: number
    ): Promise<{ ok: true } | { ok: false; message: string; missingTable: boolean }> => {
      if (!Number.isFinite(id) || id <= 0) {
        return { ok: false, message: "유효하지 않은 id입니다.", missingTable: false };
      }
      const { data: deleted, error } = await supabase
        .from(T_ALLOC)
        .delete()
        .eq("id", id)
        .select("id");
      if (error) {
        const msg = error.message;
        return { ok: false, message: msg, missingTable: isMissingRelationError(msg) };
      }
      const delRows = deleted as { id: number }[] | null;
      if (!delRows?.length) {
        return { ok: false, message: "데이터를 찾을 수 없습니다.", missingTable: false };
      }
      return { ok: true };
    },
    [supabase]
  );

  return { saveAllocation, listByRange, listLinesForCsvExport, getDetail, remove };
}
