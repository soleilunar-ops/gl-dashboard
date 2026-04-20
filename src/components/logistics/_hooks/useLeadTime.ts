"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** PM이 supabase/types에 반영하기 전까지 사용하는 import_leadtime Row */
export type ImportLeadtimeRow = {
  id: string;
  po_number: string;
  product_name: string;
  erp_code: string | null;
  bl_number: string | null;
  vessel_name: string | null;
  sea_days: number;
  customs_days: number;
  step1_actual: string | null;
  /** ① 단계 수기 예상일 (컬럼 없으면 select 시 null) */
  step1_expected: string | null;
  step2_actual: string | null;
  step3_actual: string | null;
  /** ② 상하이 출항 수기 예상일 (없으면 입항 예정−해상일로만 표시) */
  step3_expected: string | null;
  step4_expected: string | null;
  step4_actual: string | null;
  step5_expected: string | null;
  step5_actual: string | null;
  current_step: number;
  is_approved: boolean;
  tracking_status: string | null;
  created_at: string;
  updated_at: string;
};

/** 컴포넌트·지연 계산에서 공통 사용 */
export type LeadTimeRow = ImportLeadtimeRow;

/** insert 시 DB 기본값이 있는 컬럼은 생략 가능 */
type ImportLeadtimeInsert = {
  po_number: string;
  product_name: string;
  erp_code?: string | null;
  sea_days?: number;
  customs_days?: number;
  step1_actual?: string | null;
  current_step?: number;
};

/** supabase/types에 테이블이 없을 때 from/insert/update에만 사용 (런타임 테이블명은 동일) */
const LT = "import_leadtime" as never;

/** YYYY-MM-DD 기준으로 일수 더하기 */
function addCalendarDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** BL 동기화 후 진행 단계(② 카고레디 제거: 1→3→4→5) */
function currentStepAfterBlSync(
  priorRaw: number,
  departure: string | null,
  arrival: string | null,
  warehouse: string | null
): number {
  let p = priorRaw === 2 ? 1 : priorRaw;
  if (warehouse) return 5;
  if (arrival) return Math.max(p, 4);
  if (departure) return Math.max(p, 3);
  return p;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** 과거 스키마·컬럼 누락을 보정하고 current_step=2를 정규화 */
function normalizeLeadtimeRow(row: ImportLeadtimeRow): ImportLeadtimeRow {
  const merged: ImportLeadtimeRow = {
    ...row,
    step1_expected: row.step1_expected ?? null,
    step3_expected: row.step3_expected ?? null,
  };
  if (merged.current_step !== 2) return merged;
  return {
    ...merged,
    current_step: merged.step3_actual ? 3 : 1,
  };
}

export type AddOrderPayload = {
  po_number: string;
  product_name: string;
  erp_code?: string;
  sea_days?: number;
  customs_days?: number;
  /** YYYY-MM-DD, ① 발주일 */
  order_date?: string | null;
};

/** DB 단계 번호(② 카고레디 제거 후 화면에 쓰는 단계만) */
export type LeadtimeDbStep = 1 | 3 | 4 | 5;

type TrackingApiResponse = {
  vesselName: string;
  eta: string | null;
  actualArrival: string | null;
  departureDate: string | null;
  warehouseInDate: string | null;
  trackingStatus: string;
};

export function useLeadTime() {
  const supabase = useMemo(() => createClient(), []);

  const [data, setData] = useState<ImportLeadtimeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blLookupLoading, setBlLookupLoading] = useState(false);

  const toSafeYmd = useCallback((value: string | null | undefined): string | null => {
    if (!value) return null;
    const trimmed = value.trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: rows, error: qErr } = await supabase
      .from(LT)
      .select("*")
      .order("current_step", { ascending: true })
      .order("created_at", { ascending: false });

    const list = (rows ?? []) as ImportLeadtimeRow[];
    if (qErr) {
      console.error("리드타임 조회 실패:", qErr.message);
      setError(qErr.message);
      setData([]);
    } else {
      setData(list.map(normalizeLeadtimeRow));
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const addOrder = useCallback(
    async (payload: AddOrderPayload) => {
      setError(null);
      const orderYmd =
        typeof payload.order_date === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(payload.order_date.trim())
          ? payload.order_date.trim()
          : null;
      const insertRow: ImportLeadtimeInsert = {
        po_number: payload.po_number,
        product_name: payload.product_name,
        erp_code: payload.erp_code ?? null,
        sea_days: payload.sea_days ?? 2,
        customs_days: payload.customs_days ?? 2,
        step1_actual: orderYmd,
        ...(orderYmd ? { current_step: 3 } : {}),
      };
      const { error: insErr } = await supabase.from(LT).insert(insertRow as never);
      if (!insErr) {
        await fetchData();
        return;
      }
      console.error("리드타임 건 추가 실패:", insErr.message);
      setError(insErr.message);
    },
    [fetchData, supabase]
  );

  const updateActual = useCallback(
    async (id: string, step: LeadtimeDbStep, actualDate: string | null) => {
      setError(null);
      const { data: rawRow, error: selErr } = await supabase
        .from(LT)
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (selErr) {
        console.error("행 조회 실패:", selErr.message);
        setError(selErr.message);
        return;
      }
      const row = rawRow as ImportLeadtimeRow | null;
      if (!row) {
        const msg = "대상 발주를 찾을 수 없습니다.";
        console.error(msg);
        setError(msg);
        return;
      }

      const patch: Partial<ImportLeadtimeRow> = {};
      if (step === 1) patch.step1_actual = actualDate;
      else if (step === 3) patch.step3_actual = actualDate;
      else if (step === 4) patch.step4_actual = actualDate;
      else if (step === 5) patch.step5_actual = actualDate;

      if (step === 3 && actualDate && !row.step4_expected) {
        patch.step4_expected = addCalendarDays(actualDate, row.sea_days);
      }
      if (step === 4 && actualDate && !row.step5_expected) {
        patch.step5_expected = addCalendarDays(actualDate, row.customs_days);
      }

      if (actualDate && row.current_step <= step) {
        if (step === 1) patch.current_step = 3;
        else if (step === 3) patch.current_step = 4;
        else if (step === 4) patch.current_step = 5;
        else patch.current_step = 5;
      }

      const { error: upErr } = await supabase
        .from(LT)
        .update(patch as never)
        .eq("id", id);
      if (upErr) {
        console.error("실제일 저장 실패:", upErr.message);
        setError(upErr.message);
        return;
      }
      await fetchData();
    },
    [fetchData, supabase]
  );

  const updateExpected = useCallback(
    async (id: string, step: LeadtimeDbStep, expectedDate: string | null) => {
      setError(null);
      // ① 발주일은 실제일만 사용(예상일 UI 없음)
      if (step === 1) return;
      const patch: Partial<ImportLeadtimeRow> = {};
      if (step === 3) patch.step3_expected = expectedDate;
      else if (step === 4) patch.step4_expected = expectedDate;
      else if (step === 5) patch.step5_expected = expectedDate;

      const { error: upErr } = await supabase
        .from(LT)
        .update(patch as never)
        .eq("id", id);
      if (upErr) {
        console.error("예상일 저장 실패:", upErr.message);
        setError(upErr.message);
        return;
      }
      await fetchData();
    },
    [fetchData, supabase]
  );

  const saveBL = useCallback(
    async (id: string, blNumber: string): Promise<boolean> => {
      setError(null);
      const { error: blErr } = await supabase
        .from(LT)
        .update({ bl_number: blNumber } as never)
        .eq("id", id);
      if (blErr) {
        console.error("BL 저장 실패:", blErr.message);
        setError(blErr.message);
        return false;
      }

      setBlLookupLoading(true);
      try {
        const { data: rawRow } = await supabase
          .from(LT)
          .select(
            "sea_days, step3_actual, step4_expected, step4_actual, step5_actual, current_step"
          )
          .eq("id", id)
          .maybeSingle();
        const currentRow = rawRow as {
          sea_days?: number;
          step3_actual?: string | null;
          step4_expected?: string | null;
          step4_actual?: string | null;
          step5_actual?: string | null;
          current_step?: number;
        } | null;

        let priorStep = typeof currentRow?.current_step === "number" ? currentRow.current_step : 0;
        if (priorStep === 2) priorStep = 1;

        const res = await fetch(`/api/tracking?bl=${encodeURIComponent(blNumber)}`);
        const payload = (await res.json()) as TrackingApiResponse & {
          error?: string;
        };
        if (!res.ok) {
          const detail =
            typeof payload.error === "string" && payload.error.trim()
              ? payload.error
              : `조회 API 오류 (${res.status})`;
          console.error("BL 조회 실패:", detail);
          setError(detail);
          await fetchData();
          return false;
        }
        const json = payload;
        const departureDate = toSafeYmd(json.departureDate);
        const etaFromApi = toSafeYmd(json.eta);
        const actualArrival = toSafeYmd(json.actualArrival);
        const warehouseInDate = toSafeYmd(json.warehouseInDate);
        const seaDays =
          typeof currentRow?.sea_days === "number" && currentRow.sea_days > 0
            ? currentRow.sea_days
            : 2;
        const fallbackEta = departureDate
          ? addCalendarDays(departureDate, seaDays)
          : toSafeYmd(currentRow?.step4_expected ?? null);
        const nextDep = departureDate ?? toSafeYmd(currentRow?.step3_actual ?? null);
        const nextArr = actualArrival ?? toSafeYmd(currentRow?.step4_actual ?? null);
        const nextWh = warehouseInDate ?? toSafeYmd(currentRow?.step5_actual ?? null);
        const nextCs = currentStepAfterBlSync(priorStep, nextDep, nextArr, nextWh);
        const { error: upErr } = await supabase
          .from(LT)
          .update({
            vessel_name: json.vesselName,
            step3_actual: nextDep,
            step4_expected: etaFromApi ?? fallbackEta,
            step4_actual: nextArr,
            step5_actual: nextWh,
            current_step: nextCs,
            tracking_status: json.trackingStatus,
          } as never)
          .eq("id", id);
        if (upErr) {
          console.error("조회 결과 반영 실패:", upErr.message);
          setError(upErr.message);
          await fetchData();
          return false;
        }
        await fetchData();
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "조회 중 오류";
        console.error("BL 조회 실패:", msg);
        setError(msg);
        await fetchData();
        return false;
      } finally {
        setBlLookupLoading(false);
      }
    },
    [fetchData, supabase, toSafeYmd]
  );

  const approveOrder = useCallback(
    async (id: string) => {
      setError(null);
      const { error: upErr } = await supabase
        .from(LT)
        .update({ is_approved: true, current_step: 5 } as never)
        .eq("id", id);
      if (upErr) {
        console.error("승인 처리 실패:", upErr.message);
        setError(upErr.message);
        return;
      }
      await fetchData();
    },
    [fetchData, supabase]
  );

  const deleteOrder = useCallback(
    async (id: string) => {
      setError(null);
      const { error: delErr } = await supabase.from(LT).delete().eq("id", id);
      if (!delErr) {
        await fetchData();
        return;
      }
      console.error("리드타임 건 삭제 실패:", delErr.message);
      setError(delErr.message);
    },
    [fetchData, supabase]
  );

  return {
    data,
    loading,
    error,
    blLookupLoading,
    updateActual,
    updateExpected,
    saveBL,
    approveOrder,
    deleteOrder,
    addOrder,
    refetch: fetchData,
  };
}
