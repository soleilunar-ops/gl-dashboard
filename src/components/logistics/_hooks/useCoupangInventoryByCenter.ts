"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveErpCodeByItem, type ErpMappingRow } from "@/lib/logistics/resolveErpCode";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";

/** 센터 필터: 전체 */
export const COUPANG_CENTER_ALL = "all";

/** 쿠팡 센터 재고 표 정렬 기준 */
export type CoupangInventorySortBy = "center_sku" | "seq_no" | "item_name" | "stock_asc";

export const COUPANG_INVENTORY_SORT_OPTIONS: { value: CoupangInventorySortBy; label: string }[] = [
  { value: "center_sku", label: "센터 · SKU ID" },
  { value: "seq_no", label: "GL 순번" },
  { value: "item_name", label: "품목명" },
  { value: "stock_asc", label: "재고 낮은 순" },
];

/** Select 등에서 넘어온 문자열을 정렬 키로 안전히 변환 */
export function coerceCoupangInventorySortBy(raw: string): CoupangInventorySortBy {
  const hit = COUPANG_INVENTORY_SORT_OPTIONS.find((o) => o.value === raw);
  return hit ? hit.value : "center_sku";
}

function compareNullableSeq(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

function sortInventoryRows(
  list: CoupangInventoryByCenterRow[],
  sortBy: CoupangInventorySortBy
): CoupangInventoryByCenterRow[] {
  const copy = [...list];
  copy.sort((a, b) => {
    switch (sortBy) {
      case "center_sku": {
        const c = a.center.localeCompare(b.center, "ko");
        if (c !== 0) return c;
        return a.sku_id.localeCompare(b.sku_id, "ko", { numeric: true });
      }
      case "seq_no": {
        const s = compareNullableSeq(a.seq_no, b.seq_no);
        if (s !== 0) return s;
        const c = a.center.localeCompare(b.center, "ko");
        if (c !== 0) return c;
        return a.sku_id.localeCompare(b.sku_id, "ko", { numeric: true });
      }
      case "item_name": {
        const an = (a.item_name_raw ?? "").trim();
        const bn = (b.item_name_raw ?? "").trim();
        if (!an && !bn) {
          return a.sku_id.localeCompare(b.sku_id, "ko", { numeric: true });
        }
        if (!an) return 1;
        if (!bn) return -1;
        const n = an.localeCompare(bn, "ko");
        if (n !== 0) return n;
        return a.sku_id.localeCompare(b.sku_id, "ko", { numeric: true });
      }
      case "stock_asc": {
        if (a.current_stock !== b.current_stock) return a.current_stock - b.current_stock;
        const c = a.center.localeCompare(b.center, "ko");
        if (c !== 0) return c;
        return a.sku_id.localeCompare(b.sku_id, "ko", { numeric: true });
      }
      default:
        return 0;
    }
  });
  return copy;
}

export type CoupangInventoryByCenterRow = {
  invId: number;
  op_date: string;
  center: string;
  /** inventory_operation.center 원본(쿼리용, 빈값은 null) */
  center_query: string | null;
  sku_id: string;
  sku_name: string | null;
  seq_no: number | null;
  item_name_raw: string | null;
  item_id: number | null;
  bundle_ratio: number | null;
  current_stock: number;
  inbound_qty: number;
  outbound_qty: number;
  is_stockout: boolean;
  order_status: string | null;
  order_status_detail: string | null;
  /** CSV 매입원가(건당) */
  purchase_cost: number | null;
  /** item_erp_mapping 기준 지엘(GL) 품목코드 */
  gl_erp_code: string | null;
};

type InvOpRow = Tables<"inventory_operation">;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function normalizeCenter(c: string | null): string {
  return (c ?? "").trim() || "-";
}

export function useCoupangInventoryByCenter() {
  const [centerFilter, setCenterFilter] = useState<string>(COUPANG_CENTER_ALL);
  const [sortBy, setSortBy] = useState<CoupangInventorySortBy>("center_sku");
  const [baseRows, setBaseRows] = useState<CoupangInventoryByCenterRow[]>([]);
  const [centers, setCenters] = useState<string[]>([]);
  const [latestOpDate, setLatestOpDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: latestOne, error: latestErr } = await supabase
      .from("inventory_operation")
      .select("op_date")
      .order("op_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestErr) {
      setError(latestErr.message);
      setBaseRows([]);
      setCenters([]);
      setLatestOpDate(null);
      setLoading(false);
      return;
    }

    const d = latestOne?.op_date ?? null;
    setLatestOpDate(d);

    if (!d) {
      setBaseRows([]);
      setCenters([]);
      setLoading(false);
      return;
    }

    const { data: centerRows, error: centerErr } = await supabase
      .from("inventory_operation")
      .select("center")
      .eq("op_date", d);

    if (centerErr) {
      setError(centerErr.message);
      setBaseRows([]);
      setCenters([]);
      setLoading(false);
      return;
    }

    const centerSet = new Set<string>();
    for (const r of centerRows ?? []) {
      centerSet.add(normalizeCenter(r.center));
    }
    const centerList = [...centerSet].sort((a, b) => a.localeCompare(b, "ko"));
    setCenters(centerList);

    let invQuery = supabase
      .from("inventory_operation")
      .select("*")
      .eq("op_date", d)
      .order("center", { ascending: true })
      .order("sku_id", { ascending: true });

    if (centerFilter !== COUPANG_CENTER_ALL) {
      invQuery = invQuery.eq("center", centerFilter);
    }

    const { data: invRows, error: invErr } = await invQuery;

    if (invErr) {
      setError(invErr.message);
      setBaseRows([]);
      setLoading(false);
      return;
    }

    const invList = (invRows ?? []) as InvOpRow[];
    if (invList.length === 0) {
      setBaseRows([]);
      setLoading(false);
      return;
    }

    const skuIds = [...new Set(invList.map((r) => r.sku_id))];

    const skuNameById = new Map<string, string>();
    for (const batch of chunk(skuIds, 150)) {
      const { data: sm, error: smErr } = await supabase
        .from("sku_master")
        .select("sku_id, sku_name")
        .in("sku_id", batch);
      if (smErr) {
        setError(smErr.message);
        setBaseRows([]);
        setLoading(false);
        return;
      }
      for (const s of sm ?? []) {
        skuNameById.set(s.sku_id, s.sku_name);
      }
    }

    const mappingBySku = new Map<string, { item_id: number; bundle_ratio: number }>();
    for (const batch of chunk(skuIds, 150)) {
      const { data: maps, error: mapErr } = await supabase
        .from("item_coupang_mapping")
        .select("coupang_sku_id, item_id, bundle_ratio")
        .in("coupang_sku_id", batch);
      if (mapErr) {
        setError(mapErr.message);
        setBaseRows([]);
        setLoading(false);
        return;
      }
      for (const m of maps ?? []) {
        if (!mappingBySku.has(m.coupang_sku_id)) {
          mappingBySku.set(m.coupang_sku_id, {
            item_id: m.item_id,
            bundle_ratio: m.bundle_ratio,
          });
        }
      }
    }

    const itemIds = [...new Set([...mappingBySku.values()].map((v) => v.item_id))];
    const itemMeta = new Map<number, { seq_no: number | null; item_name_raw: string | null }>();
    for (const batch of chunk(itemIds, 150)) {
      const { data: ims, error: imErr } = await supabase
        .from("item_master")
        .select("item_id, seq_no, item_name_raw")
        .in("item_id", batch);
      if (imErr) {
        setError(imErr.message);
        setBaseRows([]);
        setLoading(false);
        return;
      }
      for (const im of ims ?? []) {
        itemMeta.set(im.item_id, { seq_no: im.seq_no, item_name_raw: im.item_name_raw });
      }
    }

    const allErpMappings: ErpMappingRow[] = [];
    if (itemIds.length > 0) {
      for (const batch of chunk(itemIds, 150)) {
        const { data: erpMaps, error: erpErr } = await supabase
          .from("item_erp_mapping")
          .select("item_id, erp_system, erp_code")
          .in("item_id", batch);
        if (erpErr) {
          setError(erpErr.message);
          setBaseRows([]);
          setLoading(false);
          return;
        }
        if (erpMaps) allErpMappings.push(...erpMaps);
      }
    }
    const erpCodeByItem = resolveErpCodeByItem(allErpMappings);

    const enriched: CoupangInventoryByCenterRow[] = invList.map((io) => {
      const map = mappingBySku.get(io.sku_id);
      const im = map ? itemMeta.get(map.item_id) : undefined;
      const rawCenter = io.center;
      const trimmed = rawCenter === null || rawCenter === undefined ? "" : String(rawCenter).trim();
      const center_query = trimmed.length > 0 ? trimmed : null;
      return {
        invId: io.id,
        op_date: io.op_date,
        center: normalizeCenter(io.center),
        center_query,
        sku_id: io.sku_id,
        sku_name: skuNameById.get(io.sku_id) ?? null,
        seq_no: im?.seq_no ?? null,
        item_name_raw: im?.item_name_raw ?? null,
        item_id: map?.item_id ?? null,
        bundle_ratio: map?.bundle_ratio ?? null,
        current_stock: io.current_stock ?? 0,
        inbound_qty: io.inbound_qty ?? 0,
        outbound_qty: io.outbound_qty ?? 0,
        is_stockout: io.is_stockout === true,
        order_status: io.order_status,
        order_status_detail: io.order_status_detail,
        purchase_cost: io.purchase_cost ?? null,
        gl_erp_code: map ? (erpCodeByItem.get(map.item_id) ?? null) : null,
      };
    });

    setBaseRows(enriched);
    setLoading(false);
  }, [supabase, centerFilter]);

  const rows = useMemo(() => sortInventoryRows(baseRows, sortBy), [baseRows, sortBy]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const summaryText = useMemo(() => {
    if (!latestOpDate) return null;
    const filterLabel = centerFilter === COUPANG_CENTER_ALL ? "전체 센터" : `센터 ${centerFilter}`;
    const stockout = rows.filter((r) => r.is_stockout).length;
    const low = rows.filter((r) => r.current_stock > 0 && r.current_stock < 30).length;
    const mapped = rows.filter((r) => r.item_id !== null).length;
    const parts = [
      `기준일 ${latestOpDate} · ${filterLabel} · ${rows.length.toLocaleString()}행`,
      `지엘 품목 매핑 ${mapped.toLocaleString()}건`,
      stockout > 0 ? `품절 표시 행 ${stockout}건` : null,
      low > 0 ? `재고 30미만(참고) ${low}건` : null,
    ].filter(Boolean);
    return parts.join(" · ");
  }, [latestOpDate, centerFilter, rows]);

  return {
    rows,
    sortBy,
    setSortBy,
    centers,
    centerFilter,
    setCenterFilter,
    latestOpDate,
    loading,
    error,
    refetch: fetchData,
    summaryText,
  };
}
