/**
 * coupang_daily_performance 업로드 (삭제 후 삽입 또는 건너뛰기)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedDailyPerformanceRow } from "@/components/analytics/promotion/_utils/excel-parsers/parseDailyPerformance";
import type { Database } from "@/lib/supabase/types";
import {
  fetchSeasonConfig,
  inferSeasonForIsoDate,
  pickDefaultSeason,
} from "@/components/analytics/promotion/_utils/upload/seasonAssign";
import type { UploadConflictMode, UploadResult } from "@/lib/upload/uploadTypes";
import { logUploadHistory } from "@/lib/upload/uploadHistoryLog";
import { insertInBatches } from "./uploadBatch";

function periodBounds(rows: ParsedDailyPerformanceRow[]): { min: string; max: string } {
  const dates = rows.map((r) => r.date).sort();
  return { min: dates[0]!, max: dates[dates.length - 1]! };
}

function rowKey(r: ParsedDailyPerformanceRow): string {
  return `${r.date}|${r.sku_id}|${r.vendor_item_id ?? ""}`;
}

export async function uploadDailyPerformance(
  supabase: SupabaseClient<Database>,
  rows: ParsedDailyPerformanceRow[],
  mode: UploadConflictMode,
  fileName: string
): Promise<UploadResult> {
  const errors: string[] = [];
  let inserted = 0;
  const { min: periodStart, max: periodEnd } = periodBounds(rows);

  const seasonConfig = await fetchSeasonConfig(supabase);
  const fallback = pickDefaultSeason(seasonConfig);

  let toWrite = rows.map((r) => ({
    ...r,
    is_baseline: false as const,
    season: inferSeasonForIsoDate(r.date, seasonConfig, fallback) ?? fallback,
  }));

  if (mode === "skip") {
    const { data: existing, error: exErr } = await supabase
      .from("coupang_daily_performance")
      .select("date, sku_id, vendor_item_id")
      .gte("date", periodStart)
      .lte("date", periodEnd)
      .eq("is_baseline", false);
    if (exErr) {
      errors.push(`기존 데이터 조회 실패: ${exErr.message}`);
      await logUploadHistory(supabase, {
        fileName,
        fileType: "daily_performance",
        periodStart,
        periodEnd,
        rowCount: rows.length,
        status: "failed",
      });
      return { inserted: 0, updated: 0, errors, periodStart, periodEnd };
    }
    const keys = new Set(
      (existing ?? []).map((e) => `${e.date}|${e.sku_id}|${e.vendor_item_id ?? ""}`)
    );
    toWrite = toWrite.filter((r) => !keys.has(rowKey(r)));
  } else {
    const { error: delErr } = await supabase
      .from("coupang_daily_performance")
      .delete()
      .gte("date", periodStart)
      .lte("date", periodEnd)
      .eq("is_baseline", false);
    if (delErr) {
      errors.push(`기간 내 기존 데이터 삭제 실패: ${delErr.message}`);
      await logUploadHistory(supabase, {
        fileName,
        fileType: "daily_performance",
        periodStart,
        periodEnd,
        rowCount: 0,
        status: "failed",
      });
      return { inserted: 0, updated: 0, errors, periodStart, periodEnd };
    }
  }

  inserted = await insertInBatches(
    supabase,
    "coupang_daily_performance",
    toWrite as Record<string, unknown>[],
    errors
  );

  const status = errors.length ? "partial" : "success";
  await logUploadHistory(supabase, {
    fileName,
    fileType: "daily_performance",
    periodStart,
    periodEnd,
    rowCount: inserted,
    status: errors.length && inserted === 0 ? "failed" : status,
  });

  return { inserted, updated: 0, errors, periodStart, periodEnd };
}
