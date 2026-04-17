"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";

export type ContractProductOption = {
  id: string;
  erpCode: string | null;
  name: string;
  unit: string;
  label: string;
};

type ProductRow = Pick<Tables<"products">, "id" | "erp_code" | "name" | "unit">;

/** 계약 수동 추가 폼용 품목·공급처 옵션 — Supabase에서 직접 조회 */
export function useContractFormOptions() {
  const supabase = useMemo(() => createClient(), []);
  const [products, setProducts] = useState<ContractProductOption[]>([]);
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);

      const [prodRes, supRes] = await Promise.all([
        supabase
          .from("products")
          .select("id, erp_code, name, unit")
          .eq("is_active", true)
          .order("name", { ascending: true }),
        supabase
          .from("erp_purchases")
          .select("supplier_name")
          .not("supplier_name", "is", null)
          .limit(800),
      ]);

      if (prodRes.error) {
        setError(prodRes.error.message);
        setLoading(false);
        return;
      }

      if (supRes.error) {
        setError(supRes.error.message);
        setLoading(false);
        return;
      }

      const prodRows = (prodRes.data ?? []) as ProductRow[];
      setProducts(
        prodRows.map((row) => {
          const spec = row.unit ? ` (${row.unit})` : "";
          const code = row.erp_code ?? "—";
          return {
            id: row.id,
            erpCode: row.erp_code,
            name: row.name,
            unit: row.unit,
            label: `${code} · ${row.name}${spec}`,
          };
        })
      );

      const supplierRows = (supRes.data ?? []) as { supplier_name: string | null }[];
      const names = new Set<string>();
      for (const row of supplierRows) {
        const n = row.supplier_name;
        if (n && n.trim()) {
          names.add(n.trim());
        }
      }
      setSuppliers([...names].sort((a, b) => a.localeCompare(b, "ko")));

      setLoading(false);
    };

    void run();
  }, [supabase]);

  return { products, suppliers, loading, error };
}
