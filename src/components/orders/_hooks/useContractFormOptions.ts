"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";

export type ContractCompanyCode = "gl" | "glpharm" | "hnb";

export interface ContractItemOption {
  /** item_erp_mapping.id — 동일 품목·다른 매핑 행 구분 */
  mappingId: number;
  /** item_master.item_id */
  itemId: number;
  erpCode: string | null;
  name: string;
  /** 드롭다운: 품목코드 · 품목명 */
  label: string;
  seqNo: number;
}

type ItemMasterRow = Pick<
  Tables<"item_master">,
  "item_id" | "seq_no" | "item_name_norm" | "item_name_raw"
>;
type MappingRow = Pick<Tables<"item_erp_mapping">, "id" | "item_id" | "erp_code">;

/**
 * 계약 수동 추가 폼용 품목·거래처 옵션 조회
 * 품목: 해당 기업의 item_erp_mapping 전 행(상태 무관) + item_master 조인
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

      const [mappingRes, supplierRes] = await Promise.all([
        supabase
          .from("item_erp_mapping")
          .select("id, item_id, erp_code")
          .eq("erp_system", companyCode)
          .order("id", { ascending: true }),
        supabase
          .from("orders")
          .select("counterparty")
          .eq("erp_system", companyCode)
          .eq("tx_type", "purchase")
          .not("counterparty", "is", null)
          .limit(2000),
      ]);

      if (cancelled) return;

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

      const mappingRows = (mappingRes.data ?? []) as MappingRow[];
      if (mappingRows.length === 0) {
        setItems([]);
        const supplierRows = (supplierRes.data ?? []) as { counterparty: string | null }[];
        const names = new Set<string>();
        for (const row of supplierRows) {
          const n = row.counterparty;
          if (n && n.trim()) names.add(n.trim());
        }
        setSuppliers([...names].sort((a, b) => a.localeCompare(b, "ko")));
        setLoading(false);
        return;
      }

      const itemIdSet = new Set(mappingRows.map((m) => m.item_id));
      const itemRes = await supabase
        .from("item_master")
        .select("item_id, seq_no, item_name_norm, item_name_raw")
        .in("item_id", [...itemIdSet]);

      if (cancelled) return;
      if (itemRes.error) {
        setError(itemRes.error.message);
        setLoading(false);
        return;
      }

      const itemRows = (itemRes.data ?? []) as ItemMasterRow[];
      const itemById = new Map<number, ItemMasterRow>();
      for (const it of itemRows) {
        itemById.set(it.item_id, it);
      }

      const nextOptions: ContractItemOption[] = mappingRows.map((m) => {
        const it = itemById.get(m.item_id);
        const name = it?.item_name_norm ?? it?.item_name_raw ?? "";
        const code = m.erp_code ?? "—";
        return {
          mappingId: m.id,
          itemId: m.item_id,
          erpCode: m.erp_code,
          name,
          label: `${code} · ${name}`,
          seqNo: it?.seq_no ?? 0,
        };
      });
      nextOptions.sort((a, b) => a.label.localeCompare(b.label, "ko"));
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
