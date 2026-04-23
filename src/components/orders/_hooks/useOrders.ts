"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";

/** v_orders_dashboard: orders + item_master + stock_movement 조인 한글 라벨 포함 통합 뷰 */
export type OrderDashboardRow = Tables<"v_orders_dashboard">;

export type OrderStatus = "pending" | "approved" | "rejected" | "all";
export type OrderErpSystem = "gl" | "glpharm" | "gl_pharm" | "hnb";
export type OrderTxType = "purchase" | "sale" | "return_sale" | "return_purchase" | "production_in";

export interface UseOrdersOptions {
  /** 'all'이면 상태 필터 미적용(pending 우선 정렬) */
  status: OrderStatus;
  /** 빈 배열이면 기업 필터 미적용(전체 노출) */
  erpSystems: OrderErpSystem[];
  /** 빈 배열이면 거래유형 필터 미적용(전체 노출) */
  txTypes: OrderTxType[];
  /** 공백 허용, trim 후 ilike 검색에 쓰임 */
  itemSearch: string;
  /** YYYY-MM-DD 문자열. null이면 필터 미적용 */
  dateFrom: string | null;
  dateTo: string | null;
  /** 0-base 페이지 인덱스 */
  page: number;
  pageSize: number;
}

export interface UseOrdersResult {
  rows: OrderDashboardRow[];
  totalCount: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  /** 변경 이유: ERP 적재 직후 page 상태와 무관하게 0페이지부터 조회해 표에 신규 건이 보이게 함 */
  refetchFromStart: () => Promise<void>;
}

/** 승인 워크플로우 메인 훅 — v_orders_dashboard 기반 서버 사이드 페이징 */
export function useOrders(opts: UseOrdersOptions): UseOrdersResult {
  const [rows, setRows] = useState<OrderDashboardRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  const { status, erpSystems, txTypes, itemSearch, dateFrom, dateTo, page, pageSize } = opts;
  const normalizedErpSystems = useMemo<OrderErpSystem[]>(() => {
    const set = new Set<OrderErpSystem>();
    for (const code of erpSystems) {
      if (code === "glpharm" || code === "gl_pharm") {
        set.add("glpharm");
        set.add("gl_pharm");
      } else {
        set.add(code);
      }
    }
    return [...set];
  }, [erpSystems]);

  const fetchRows = useCallback(
    async (pageIndexOverride?: number) => {
      setLoading(true);
      setError(null);

      const pageIndex = pageIndexOverride !== undefined ? pageIndexOverride : page;

      // 필터 토글이 모두 해제된 경우 = "배제" 의미 → 0건 반환 (쿼리 생략)
      if (normalizedErpSystems.length === 0 || txTypes.length === 0) {
        setRows([]);
        setTotalCount(0);
        setLoading(false);
        return;
      }

      let q = supabase.from("v_orders_dashboard").select("*", { count: "exact" });

      if (status !== "all") {
        q = q.eq("status", status);
      }
      q = q.in("erp_system", normalizedErpSystems);
      q = q.in("tx_type", txTypes);
      const searchTerm = itemSearch.trim();
      if (searchTerm) {
        // 품목명(item_name) + ERP 코드 통합 검색 (item_name_norm alias + erp_code)
        q = q.or(`item_name.ilike.%${searchTerm}%,erp_code.ilike.%${searchTerm}%`);
      }
      if (dateFrom) {
        q = q.gte("tx_date", dateFrom);
      }
      if (dateTo) {
        q = q.lte("tx_date", dateTo);
      }

      // 정렬: 전체 탭에서는 pending 먼저, 그 외 탭은 날짜 DESC만
      if (status === "all") {
        // 클라이언트 사이드 정렬로 pending 우선 — supabase .or() 직후 order 제약 회피
        // DB 측 정렬: tx_date DESC, order_id DESC (pending 우선은 후처리)
      }
      q = q.order("tx_date", { ascending: false }).order("order_id", { ascending: false });

      const from = pageIndex * pageSize;
      const to = from + pageSize - 1;
      q = q.range(from, to);

      const { data, count, error: err } = await q;
      if (err) {
        setError(err.message);
        setRows([]);
        setTotalCount(0);
      } else {
        let ordered = data ?? [];
        if (status === "all") {
          // pending 우선 (같은 date 내에서)
          ordered = [...ordered].sort((a, b) => {
            const ap = a.status === "pending" ? 0 : 1;
            const bp = b.status === "pending" ? 0 : 1;
            if (ap !== bp) return ap - bp;
            return 0;
          });
        }
        setRows(ordered);
        setTotalCount(count ?? 0);
      }
      setLoading(false);
    },
    [supabase, status, normalizedErpSystems, txTypes, itemSearch, dateFrom, dateTo, page, pageSize]
  );

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const refetchFromStart = useCallback(async () => {
    await fetchRows(0);
  }, [fetchRows]);

  return {
    rows,
    totalCount,
    loading,
    error,
    refetch: useCallback(async () => {
      await fetchRows();
    }, [fetchRows]),
    refetchFromStart,
  };
}
