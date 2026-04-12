"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
// import { FASTAPI_URL } from "@/lib/constants";

// 수요 예측: coupang_performance + FastAPI 예측 결과
export function useForecast() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const fetchData = async () => {
      // 쿠팡 성과 데이터 조회
      const { data: perfData } = await supabase
        .from("coupang_performance")
        .select("*")
        .order("sale_date", { ascending: false })
        .limit(100);

      if (perfData) setData(perfData);
      setLoading(false);

      // TODO: FastAPI 예측 호출
      // const res = await fetch(`${FASTAPI_URL}/forecast`);
      // const forecast = await res.json();
    };

    fetchData();
  }, []);

  return { data, loading };
}
