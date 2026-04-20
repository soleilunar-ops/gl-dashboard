"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";

export type ContractCompanyCode = "gl" | "gl_pharm" | "hnb";

export interface ContractItemOption {
  /** item_master.item_id (bigint) */
  itemId: number;
  /** item_erp_mapping.erp_code — 선택한 기업 기준 */
  erpCode: string | null;
  /** item_master.item_name_norm (정규화 품목명) */
  name: string;
  /** 드롭다운 label: "ERP코드 · 품목명" */
  label: string;
  /** item_master.seq_no — 정렬/표시용 */
  seqNo: number;
}

type ItemMasterRow = Pick<
  Tables<"item_master">,
  "item_id" | "seq_no" | "item_name_norm" | "item_name_raw" | "is_active"
>;
type MappingRow = Pick<Tables<"item_erp_mapping">, "item_id" | "erp_code">;

/**
 * 계약 수동 추가 폼용 품목·거래처 옵션 조회
 *
 * v6 대응:
 * - 품목: item_master (144) + item_erp_mapping (선택 기업의 verified 매핑)
 * - 거래처: orders.counterparty (tx_type='purchase') DISTINCT
 */
export function useContractFormOptions(companyCode: ContractCompanyCode | null) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<ContractItemOption[]>([]);
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (companyCode === null) {
      setItems([]);
      setSuppliers([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);

      const [itemRes, mappingRes, supplierRes] = await Promise.all([
        supabase
          .from("item_master")
          .select("item_id, seq_no, item_name_norm, item_name_raw, is_active")
          .eq("is_active", true)
          .order("seq_no", { ascending: true }),
        supabase.from("item_erp_mapping").select("item_id, erp_code").eq("erp_system", companyCode),
        supabase
          .from("orders")
          .select("counterparty")
          .eq("erp_system", companyCode)
          .eq("tx_type", "purchase")
          .not("counterparty", "is", null)
          .limit(2000),
      ]);

      if (cancelled) return;

      if (itemRes.error) {
        setError(itemRes.error.message);
        setLoading(false);
        return;
      }
      if (mappingRes.error) {
        setError(mappingRes.error.message);
        setLoading(false);
        return;
      }
      if (supplierRes.error) {
        setError(supplierRes.error.message);
        setLoading(false);
        return;
      }

      const itemRows = (itemRes.data ?? []) as ItemMasterRow[];
      const mappingRows = (mappingRes.data ?? []) as MappingRow[];
      const mappingByItem = new Map<number, string | null>();
      for (const m of mappingRows) {
        mappingByItem.set(m.item_id, m.erp_code);
      }

      const nextOptions: ContractItemOption[] = itemRows.map((it) => {
        const erpCode = mappingByItem.get(it.item_id) ?? null;
        const name = it.item_name_norm ?? it.item_name_raw ?? "";
        const codeLabel = erpCode ?? "—";
        return {
          itemId: it.item_id,
          erpCode,
          name,
          label: `${codeLabel} · ${name}`,
          seqNo: it.seq_no,
        };
      });
      setItems(nextOptions);

      const supplierRows = (supplierRes.data ?? []) as { counterparty: string | null }[];
      const names = new Set<string>();
      for (const row of supplierRows) {
        const n = row.counterparty;
        if (n && n.trim()) names.add(n.trim());
      }
      setSuppliers([...names].sort((a, b) => a.localeCompare(b, "ko")));

      setLoading(false);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [companyCode, supabase]);

  return { items, suppliers, loading, error };
}
