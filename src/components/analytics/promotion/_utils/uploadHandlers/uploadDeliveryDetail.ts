/**
 * coupang_delivery_detail 업로드
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedDeliveryRow } from "@/components/analytics/promotion/_utils/excel-parsers/parseDeliveryDetail";
import type { Database } from "@/lib/supabase/types";
import {
  fetchSeasonConfig,
  inferSeasonForIsoDate,
  pickDefaultSeason,
} from "@/components/analytics/promotion/_utils/upload/seasonAssign";
import type { UploadConflictMode, UploadResult } from "@/lib/upload/uploadTypes";
import { logUploadHistory } from "@/lib/upload/uploadHistoryLog";
import { insertInBatches } from "./uploadBatch";

function periodBounds(rows: ParsedDeliveryRow[]): { min: string; max: string } {
  const dates = rows.map((r) => r.delivery_date).sort();
  return { min: dates[0]!, max: dates[dates.length - 1]! };
}

function rowKey(r: ParsedDeliveryRow): string {
  return `${r.delivery_date}|${r.invoice_no ?? ""}|${r.sku_id ?? ""}`;
}

export async function uploadDeliveryDetail(
  supabase: SupabaseClient<Database>,
  rows: ParsedDeliveryRow[],
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
    season: inferSeasonForIsoDate(r.delivery_date, seasonConfig, fallback) ?? fallback,
  }));

  if (mode === "skip") {
    const { data: existing, error: exErr } = await supabase
      .from("coupang_delivery_detail")
      .select("delivery_date, invoice_no, sku_id")
      .gte("delivery_date", periodStart)
      .lte("delivery_date", periodEnd)
      .eq("is_baseline", false);
    if (exErr) {
      errors.push(`기존 데이터 조회 실패: ${exErr.message}`);
      await logUploadHistory(supabase, {
        fileName,
        fileType: "delivery_detail",
        periodStart,
        periodEnd,
        rowCount: rows.length,
        status: "failed",
      });
      return { inserted: 0, updated: 0, errors, periodStart, periodEnd };
    }
    const keys = new Set((existing ?? []).map((e) => rowKey(e as ParsedDeliveryRow)));
    toWrite = toWrite.filter((r) => !keys.has(rowKey(r)));
  } else {
    const { error: delErr } = await supabase
      .from("coupang_delivery_detail")
      .delete()
      .gte("delivery_date", periodStart)
      .lte("delivery_date", periodEnd)
      .eq("is_baseline", false);
    if (delErr) {
      errors.push(`기간 내 기존 데이터 삭제 실패: ${delErr.message}`);
      await logUploadHistory(supabase, {
        fileName,
        fileType: "delivery_detail",
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
    "coupang_delivery_detail",
    toWrite as Record<string, unknown>[],
    errors
  );

  const status = errors.length ? "partial" : "success";
  await logUploadHistory(supabase, {
    fileName,
    fileType: "delivery_detail",
    periodStart,
    periodEnd,
    rowCount: inserted,
    status: errors.length && inserted === 0 ? "failed" : status,
  });

  return { inserted, updated: 0, errors, periodStart, periodEnd };
}
