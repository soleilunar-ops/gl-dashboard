"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// 재고 관리: v_inventory_dashboard 뷰 또는 inventory 테이블
export function useInventory() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const fetchData = async () => {
      // v_inventory_dashboard 뷰가 있으면 사용, 없으면 inventory 직접 조회
      const { data } = await supabase
        .from("inventory")
        .select("*, products(name, sku, category)")
        .order("updated_at", { ascending: false });

      if (data) setData(data);
      setLoading(false);
    };

    fetchData();
  }, []);

  return { data, loading };
}
