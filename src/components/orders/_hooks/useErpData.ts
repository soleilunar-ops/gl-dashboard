// Supabase 자동 타입에 public.ecount_* 미포함 — 동적 테이블 조회만 이 파일에서 허용
"use client";

/**
 * ERP 크롤링 결과 조회 훅
 *
 * Supabase ecount_purchase / ecount_sales / ecount_stock_ledger 에서
 * 필터(기업/기간) 적용한 데이터를 서버 사이드 페이지네이션으로 로드한다.
 *
 * v2: 서버 페이지네이션 + 팀 supabase 패턴(createClient + useMemo) 통일.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type ErpMenu = "purchase" | "sales" | "stock_ledger" | "production_outsource";

export type CompanyCode = "gl" | "gl_pharm" | "hnb";

const TABLE_BY_MENU: Record<ErpMenu, string> = {
  purchase: "ecount_purchase",
  sales: "ecount_sales",
  stock_ledger: "ecount_stock_ledger",
  production_outsource: "ecount_production_outsource",
};

/** supabase/generated 타입에 public.ecount_* 미포함 — 런타임 행은 객체로 처리 */
export type ErpRow = Record<string, unknown>;

/** companyCode 범위에 맞춰 매핑 조회에 쓸 erp_system 목록 */
function mappingSystemsFromCompanyFilter(
  companyCode: CompanyCode | "all" | readonly CompanyCode[] | undefined
): CompanyCode[] {
  if (companyCode === undefined || companyCode === "all") return ["gl", "gl_pharm", "hnb"];
  if (typeof companyCode === "string") return [companyCode];
  return [...companyCode];
}

export interface UseErpDataParams {
  menu: ErpMenu;
  /** 단일·전체(all)·복수 기업(in) */
  companyCode?: CompanyCode | "all" | readonly CompanyCode[];
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;
  /** 0-base 페이지 인덱스 */
  page?: number;
  pageSize?: number;
  /** true면 item_erp_mapping에 등록된 ERP 코드 행만 (구매·판매). 재고수불부는 품목코드 열 없음으로 미적용 */
  onlyMappedMasterItems?: boolean;
}

export interface UseErpDataResult {
  rows: ErpRow[];
  totalCount: number;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export const DEFAULT_ERP_PAGE_SIZE = 100;

export function useErpData(params: UseErpDataParams): UseErpDataResult {
  const {
    menu,
    companyCode,
    dateFrom,
    dateTo,
    page = 0,
    pageSize = DEFAULT_ERP_PAGE_SIZE,
    onlyMappedMasterItems = false,
  } = params;

  const [rows, setRows] = useState<ErpRow[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const reqIdRef = useRef(0);
  const supabase = useMemo(() => createClient(), []);

  const fetchRows = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);

    const table = TABLE_BY_MENU[menu];
    const mappingSystems = mappingSystemsFromCompanyFilter(companyCode);

    let erpCodesFilter: string[] | null = null;
    if (
      onlyMappedMasterItems &&
      (menu === "purchase" || menu === "sales" || menu === "production_outsource")
    ) {
      const { data: mapRows, error: mapErr } = await supabase
        .from("item_erp_mapping")
        .select("erp_code")
        .in("erp_system", mappingSystems)
        .not("erp_code", "is", null);

      if (reqId !== reqIdRef.current) return;

      if (mapErr) {
        console.error("[useErpData] 매핑 조회 실패:", mapErr.message);
        setError(mapErr.message);
        setRows([]);
        setTotalCount(0);
        setLoading(false);
        return;
      }
      erpCodesFilter = [
        ...new Set(
          (mapRows ?? [])
            .map((r) => r.erp_code)
            .filter((c): c is string => typeof c === "string" && c.length > 0)
        ),
      ];
      if (erpCodesFilter.length === 0) {
        setRows([]);
        setTotalCount(0);
        setLoading(false);
        return;
      }
    }

    const tableName = TABLE_BY_MENU[menu];
    let q = supabase
      .from(tableName as never)
      .select("*", { count: "exact" })
      .order("doc_date", {
        ascending: false,
      });

    if (Array.isArray(companyCode) && companyCode.length > 0) {
      q = q.in("company_code", [...companyCode]);
    } else if (!Array.isArray(companyCode) && companyCode && companyCode !== "all") {
      q = q.eq("company_code", companyCode);
    }
    if (dateFrom) q = q.gte("doc_date", dateFrom);
    if (dateTo) q = q.lte("doc_date", dateTo);

    if (erpCodesFilter && erpCodesFilter.length > 0) {
      q = q.in("erp_code", erpCodesFilter);
    }

    // 서버 사이드 페이지네이션
    const from = page * pageSize;
    const to = from + pageSize - 1;
    q = q.range(from, to);

    const { data, count, error: qErr } = await q;

    // 최신 요청만 반영 (stale response 가드)
    if (reqId !== reqIdRef.current) return;

    if (qErr) {
      console.error("[useErpData] 조회 실패:", qErr.message);
      setError(qErr.message);
      setRows([]);
      setTotalCount(0);
      setLoading(false);
      return;
    }
    setRows((data ?? []) as ErpRow[]);
    setTotalCount(count ?? 0);
    setLoading(false);
  }, [supabase, menu, companyCode, dateFrom, dateTo, page, pageSize, onlyMappedMasterItems]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  return { rows, totalCount, loading, error, refetch: fetchRows };
}
