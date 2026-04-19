/**
 * promotion_milkrun_costs 업로드 (year_month + live 범위)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { milkrunDedupKey, type ParsedMilkrunRow } from "@/lib/excel-parsers/parseMilkrunCosts";
import type { Database } from "@/lib/supabase/types";
import { fetchSeasonConfig, inferSeasonForYm, pickDefaultSeason } from "@/lib/upload/seasonAssign";
import type { UploadConflictMode, UploadResult } from "@/lib/upload/uploadTypes";
import { logUploadHistory } from "@/lib/upload/uploadHistoryLog";
import { insertInBatches } from "./uploadBatch";

export async function uploadMilkrunCosts(
  supabase: SupabaseClient<Database>,
  rows: ParsedMilkrunRow[],
  mode: UploadConflictMode,
  fileName: string
): Promise<UploadResult> {
  const errors: string[] = [];
  let inserted = 0;

  const yms = [...new Set(rows.map((r) => r.year_month))].sort();
  const periodStart = `${yms[0] ?? ""}-01`;
  const lastYm = yms[yms.length - 1] ?? "";
  const [ly, lm] = lastYm.split("-").map(Number);
  const periodEnd = new Date(ly, lm, 0).toISOString().slice(0, 10);

  const seasonConfig = await fetchSeasonConfig(supabase);
  const fallback = pickDefaultSeason(seasonConfig);

  let toWrite = rows.map((r) => ({
    ...r,
    is_baseline: false as const,
    season: inferSeasonForYm(r.year_month, seasonConfig, fallback) ?? fallback,
  }));

  if (mode === "replace") {
    const { error: delErr } = await supabase
      .from("promotion_milkrun_costs")
      .delete()
      .in("year_month", yms)
      .eq("is_baseline", false);
    if (delErr) {
      errors.push(`기존 밀크런 비용 삭제 실패: ${delErr.message}`);
      await logUploadHistory(supabase, {
        fileName,
        fileType: "milkrun_costs",
        periodStart,
        periodEnd,
        rowCount: 0,
        status: "failed",
      });
      return { inserted: 0, updated: 0, errors, periodStart, periodEnd };
    }
  } else {
    const { data: existing, error: exErr } = await supabase
      .from("promotion_milkrun_costs")
      .select("id, year_month, amount, delivery_date, description")
      .in("year_month", yms)
      .eq("is_baseline", false);
    if (exErr) {
      errors.push(`기존 데이터 조회 실패: ${exErr.message}`);
      await logUploadHistory(supabase, {
        fileName,
        fileType: "milkrun_costs",
        periodStart,
        periodEnd,
        rowCount: 0,
        status: "failed",
      });
      return { inserted: 0, updated: 0, errors, periodStart, periodEnd };
    }
    const keys = new Set((existing ?? []).map((e) => milkrunDedupKey(e as ParsedMilkrunRow)));
    toWrite = toWrite.filter((r) => !keys.has(milkrunDedupKey(r)));
  }

  inserted = await insertInBatches(
    supabase,
    "promotion_milkrun_costs",
    toWrite as Record<string, unknown>[],
    errors
  );

  const status = errors.length ? "partial" : "success";
  await logUploadHistory(supabase, {
    fileName,
    fileType: "milkrun_costs",
    periodStart,
    periodEnd,
    rowCount: inserted,
    status: errors.length && inserted === 0 ? "failed" : status,
  });

  return { inserted, updated: 0, errors, periodStart, periodEnd };
}
