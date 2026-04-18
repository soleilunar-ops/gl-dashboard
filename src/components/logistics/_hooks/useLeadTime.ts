"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** DB 없이 리드타임 UI·/api/tracking 만 검증할 때 .env에 NEXT_PUBLIC_LEADTIME_MOCK=true */
const LEADTIME_MOCK =
  typeof process.env.NEXT_PUBLIC_LEADTIME_MOCK === "string" &&
  process.env.NEXT_PUBLIC_LEADTIME_MOCK === "true";

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
  step2_actual: string | null;
  step3_actual: string | null;
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

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `mock-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** 모의 시드 1건 — BL 조회 API만 실제 호출 가능 */
const MOCK_SEED_ROWS: ImportLeadtimeRow[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    po_number: "MOCK-PO-1",
    product_name: "[모의] 샘플 원료",
    erp_code: "ERP-DEMO",
    bl_number: null,
    vessel_name: null,
    sea_days: 2,
    customs_days: 2,
    step1_actual: "2026-04-01",
    step2_actual: null,
    step3_actual: null,
    step4_expected: null,
    step4_actual: null,
    step5_expected: null,
    step5_actual: null,
    current_step: 2,
    is_approved: false,
    tracking_status: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  },
];

export type AddOrderPayload = {
  po_number: string;
  product_name: string;
  erp_code?: string;
  sea_days?: number;
  customs_days?: number;
};

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
    if (LEADTIME_MOCK) {
      setData(MOCK_SEED_ROWS.map((r) => ({ ...r, updated_at: nowIso() })));
      setLoading(false);
      return;
    }
    const { data: rows, error: qErr } = await supabase
      .from(LT)
      .select("*")
      .order("current_step", { ascending: true })
      .order("created_at", { ascending: false });

    if (qErr) {
      console.error("리드타임 조회 실패:", qErr.message);
      setError(qErr.message);
      setData([]);
      setLoading(false);
      return;
    }
    setData((rows ?? []) as ImportLeadtimeRow[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const addOrder = useCallback(
    async (payload: AddOrderPayload) => {
      setError(null);
      if (LEADTIME_MOCK) {
        const row: ImportLeadtimeRow = {
          id: newId(),
          po_number: payload.po_number,
          product_name: payload.product_name,
          erp_code: payload.erp_code ?? null,
          bl_number: null,
          vessel_name: null,
          sea_days: payload.sea_days ?? 2,
          customs_days: payload.customs_days ?? 2,
          step1_actual: null,
          step2_actual: null,
          step3_actual: null,
          step4_expected: null,
          step4_actual: null,
          step5_expected: null,
          step5_actual: null,
          current_step: 0,
          is_approved: false,
          tracking_status: null,
          created_at: nowIso(),
          updated_at: nowIso(),
        };
        setData((prev) => [row, ...prev]);
        return;
      }
      const insertRow: ImportLeadtimeInsert = {
        po_number: payload.po_number,
        product_name: payload.product_name,
        erp_code: payload.erp_code ?? null,
        sea_days: payload.sea_days ?? 2,
        customs_days: payload.customs_days ?? 2,
      };
      const { error: insErr } = await supabase.from(LT).insert(insertRow as never);
      if (insErr) {
        console.error("발주 추가 실패:", insErr.message);
        setError(insErr.message);
        return;
      }
      await fetchData();
    },
    [fetchData, supabase]
  );

  const updateActual = useCallback(
    async (id: string, step: number, actualDate: string | null) => {
      setError(null);
      if (LEADTIME_MOCK) {
        setData((prev) =>
          prev.map((row) => {
            if (row.id !== id) return row;
            const patch: Partial<ImportLeadtimeRow> = {};
            if (step === 1) patch.step1_actual = actualDate;
            else if (step === 2) patch.step2_actual = actualDate;
            else if (step === 3) patch.step3_actual = actualDate;
            else if (step === 4) patch.step4_actual = actualDate;
            else if (step === 5) patch.step5_actual = actualDate;
            if (step === 3 && actualDate) {
              patch.step4_expected = addCalendarDays(actualDate, row.sea_days);
            }
            if (step === 4 && actualDate) {
              patch.step5_expected = addCalendarDays(actualDate, row.customs_days);
            }
            let nextStep = row.current_step;
            if (actualDate && row.current_step <= step) {
              nextStep = Math.min(step + 1, 5);
            }
            return {
              ...row,
              ...patch,
              current_step: nextStep,
              updated_at: nowIso(),
            };
          })
        );
        return;
      }
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
      else if (step === 2) patch.step2_actual = actualDate;
      else if (step === 3) patch.step3_actual = actualDate;
      else if (step === 4) patch.step4_actual = actualDate;
      else if (step === 5) patch.step5_actual = actualDate;

      if (step === 3 && actualDate) {
        patch.step4_expected = addCalendarDays(actualDate, row.sea_days);
      }
      if (step === 4 && actualDate) {
        patch.step5_expected = addCalendarDays(actualDate, row.customs_days);
      }

      if (actualDate && row.current_step <= step) {
        patch.current_step = Math.min(step + 1, 5);
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

  const updateParams = useCallback(
    async (id: string, seaDays: number, customsDays: number) => {
      setError(null);
      if (LEADTIME_MOCK) {
        setData((prev) =>
          prev.map((row) => {
            if (row.id !== id) return row;
            const patch: Partial<ImportLeadtimeRow> = {
              sea_days: seaDays,
              customs_days: customsDays,
            };
            if (row.step3_actual) {
              patch.step4_expected = addCalendarDays(row.step3_actual, seaDays);
            }
            const step4Ref = row.step4_actual ?? row.step4_expected;
            if (step4Ref) {
              patch.step5_expected = addCalendarDays(step4Ref, customsDays);
            }
            return { ...row, ...patch, updated_at: nowIso() };
          })
        );
        return;
      }
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

      const patch: Partial<ImportLeadtimeRow> = {
        sea_days: seaDays,
        customs_days: customsDays,
      };

      if (row.step3_actual) {
        patch.step4_expected = addCalendarDays(row.step3_actual, seaDays);
      }
      const step4Ref = row.step4_actual ?? row.step4_expected;
      if (step4Ref) {
        patch.step5_expected = addCalendarDays(step4Ref, customsDays);
      }

      const { error: upErr } = await supabase
        .from(LT)
        .update(patch as never)
        .eq("id", id);
      if (upErr) {
        console.error("파라미터 저장 실패:", upErr.message);
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
      if (LEADTIME_MOCK) {
        setBlLookupLoading(true);
        try {
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
            return false;
          }
          const departureDate = toSafeYmd(payload.departureDate);
          const etaFromApi = toSafeYmd(payload.eta);
          const actualArrival = toSafeYmd(payload.actualArrival);
          const warehouseInDate = toSafeYmd(payload.warehouseInDate);
          setData((prev) =>
            prev.map((row) =>
              row.id === id
                ? {
                    ...row,
                    bl_number: blNumber,
                    vessel_name: payload.vesselName || null,
                    step3_actual: departureDate ?? row.step3_actual,
                    step4_expected:
                      etaFromApi ??
                      (departureDate
                        ? addCalendarDays(departureDate, row.sea_days)
                        : row.step4_expected),
                    step4_actual: actualArrival,
                    step5_actual: warehouseInDate ?? row.step5_actual,
                    current_step: warehouseInDate ? 5 : row.current_step,
                    tracking_status: payload.trackingStatus || null,
                    updated_at: nowIso(),
                  }
                : row
            )
          );
          return true;
        } catch (e) {
          const msg = e instanceof Error ? e.message : "조회 중 오류";
          console.error("BL 조회 실패:", msg);
          setError(msg);
          return false;
        } finally {
          setBlLookupLoading(false);
        }
      }
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
          .select("sea_days, step3_actual, step4_expected, step5_actual, current_step")
          .eq("id", id)
          .maybeSingle();
        const currentRow = rawRow as {
          sea_days?: number;
          step3_actual?: string | null;
          step4_expected?: string | null;
          step5_actual?: string | null;
          current_step?: number;
        } | null;

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
        const { error: upErr } = await supabase
          .from(LT)
          .update({
            vessel_name: json.vesselName,
            step3_actual: departureDate ?? toSafeYmd(currentRow?.step3_actual ?? null),
            step4_expected: etaFromApi ?? fallbackEta,
            step4_actual: actualArrival,
            step5_actual: warehouseInDate ?? toSafeYmd(currentRow?.step5_actual ?? null),
            current_step: warehouseInDate
              ? 5
              : typeof currentRow?.current_step === "number"
                ? currentRow.current_step
                : 0,
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
      if (LEADTIME_MOCK) {
        setData((prev) =>
          prev.map((row) =>
            row.id === id
              ? { ...row, is_approved: true, current_step: 5, updated_at: nowIso() }
              : row
          )
        );
        return;
      }
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

  return {
    data,
    loading,
    error,
    blLookupLoading,
    /** DB 없이 모의 모드인지 (UI 배지용) */
    isMockMode: LEADTIME_MOCK,
    updateActual,
    updateParams,
    saveBL,
    approveOrder,
    addOrder,
    refetch: fetchData,
  };
}
