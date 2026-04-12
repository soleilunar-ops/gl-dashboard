"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// 입출고 내역: stock_movements 테이블
export function useStockMovements() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const fetchData = async () => {
      const { data } = await supabase
        .from("stock_movements")
        .select("*, products(name, sku)")
        .order("created_at", { ascending: false });

      if (data) setData(data);
      setLoading(false);
    };

    fetchData();
  }, []);

  return { data, loading };
}
