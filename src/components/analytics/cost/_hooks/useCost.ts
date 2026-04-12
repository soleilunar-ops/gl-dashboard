"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// 원가 분석: products(unit_cost) + coupang_performance(cogs)
export function useCost() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const fetchData = async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, sku, category, unit_cost")
        .order("name", { ascending: true });

      if (data) setData(data);
      setLoading(false);
    };

    fetchData();
  }, []);

  return { data, loading };
}
