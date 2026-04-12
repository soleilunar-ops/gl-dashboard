"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// 리뷰 분석: coupang_performance에서 review_count, avg_rating
export function useReviews() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const fetchData = async () => {
      const { data } = await supabase
        .from("coupang_performance")
        .select("coupang_sku_id, product_name, review_count, avg_rating, sale_date")
        .order("sale_date", { ascending: false })
        .limit(100);

      if (data) setData(data);
      setLoading(false);
    };

    fetchData();
  }, []);

  return { data, loading };
}
