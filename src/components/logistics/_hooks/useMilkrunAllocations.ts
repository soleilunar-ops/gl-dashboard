// 변경 이유: 리드타임과 같이 Supabase 클라이언트로 밀크런 배정을 저장·조회합니다.
"use client";

import { useCallback, useMemo } from "react";

import { createClient } from "@/lib/supabase/client";

import { getDetail as getDetailImpl } from "./milkrun/getDetail";
import { listByRange as listByRangeImpl } from "./milkrun/listByRange";
import { listLinesForCsvExport as listLinesForCsvExportImpl } from "./milkrun/listLinesForCsvExport";
import { remove as removeImpl } from "./milkrun/remove";
import { saveAllocation as saveAllocationImpl } from "./milkrun/saveAllocation";
import type { MilkrunSaveLineInput } from "./milkrun/types";

// 원본 공개 타입 7개 — MilkrunHistoryTab 등 외부 소비자 import 경로 보존
export type {
  MilkrunDailyRow,
  MilkrunDetail,
  MilkrunDetailItem,
  MilkrunExportLine,
  MilkrunHistoryRecord,
  MilkrunHistorySummary,
  MilkrunSaveLineInput,
} from "./milkrun/types";

export function useMilkrunAllocations() {
  const supabase = useMemo(() => createClient(), []);

  const saveAllocation = useCallback(
    (orderDateRaw: string, memo: string | null, lines: MilkrunSaveLineInput[]) =>
      saveAllocationImpl(supabase, orderDateRaw, memo, lines),
    [supabase]
  );

  const listByRange = useCallback(
    (start: string, end: string) => listByRangeImpl(supabase, start, end),
    [supabase]
  );

  const listLinesForCsvExport = useCallback(
    (start: string, end: string) => listLinesForCsvExportImpl(supabase, start, end),
    [supabase]
  );

  const getDetail = useCallback((id: number) => getDetailImpl(supabase, id), [supabase]);

  const remove = useCallback((id: number) => removeImpl(supabase, id), [supabase]);

  return { saveAllocation, listByRange, listLinesForCsvExport, getDetail, remove };
}
