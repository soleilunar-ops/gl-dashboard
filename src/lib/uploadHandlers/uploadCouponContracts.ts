/**
 * promotion_coupon_contracts UPSERT (계약번호 기준)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedCouponContractRow } from "@/lib/excel-parsers/parseCouponContracts";
import type { Database } from "@/lib/supabase/types";
import {
  fetchSeasonConfig,
  inferSeasonForIsoDate,
  pickDefaultSeason,
} from "@/lib/upload/seasonAssign";
import type { UploadResult } from "@/lib/upload/uploadTypes";
import { logUploadHistory } from "@/lib/upload/uploadHistoryLog";

const BATCH = 100;

export async function uploadCouponContracts(
  supabase: SupabaseClient<Database>,
  rows: ParsedCouponContractRow[],
  fileName: string
): Promise<UploadResult> {
  const errors: string[] = [];
  const seasonConfig = await fetchSeasonConfig(supabase);
  const fallback = pickDefaultSeason(seasonConfig);

  const payload = rows.map((r) => {
    const start = r.start_date ?? "";
    const season = (start && inferSeasonForIsoDate(start, seasonConfig, fallback)) ?? fallback;
    return {
      ...r,
      is_baseline: false as const,
      season: season ?? null,
    };
  });

  const dates = payload.flatMap((r) => [r.start_date, r.end_date]).filter(Boolean) as string[];
  const sorted = dates.sort();
  const periodStart = sorted[0] ?? "";
  const periodEnd = sorted[sorted.length - 1] ?? "";

  let updated = 0;
  for (let i = 0; i < payload.length; i += BATCH) {
    const chunk = payload.slice(i, i + BATCH);
    const { error } = await supabase.from("promotion_coupon_contracts").upsert(chunk as never, {
      onConflict: "contract_no",
    });
    if (error) {
      errors.push(`계약 ${i + 1}건째부터 저장 오류: ${error.message}`);
      break;
    }
    updated += chunk.length;
  }

  const status = errors.length ? (updated > 0 ? "partial" : "failed") : "success";
  await logUploadHistory(supabase, {
    fileName,
    fileType: "coupon_contracts",
    periodStart: periodStart || new Date().toISOString().slice(0, 10),
    periodEnd: periodEnd || periodStart || new Date().toISOString().slice(0, 10),
    rowCount: updated,
    status,
  });

  return { inserted: 0, updated, errors, periodStart, periodEnd };
}
