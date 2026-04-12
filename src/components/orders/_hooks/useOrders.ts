"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// 주문 = stock_movements에서 movement_type='출고' 기준
export function useOrders() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const fetchData = async () => {
      const { data } = await supabase
        .from("stock_movements")
        .select("*, products(name, sku)")
        .eq("movement_type", "출고")
        .order("created_at", { ascending: false });

      if (data) setData(data);
      setLoading(false);
    };

    fetchData();
  }, []);

  return { data, loading };
}
