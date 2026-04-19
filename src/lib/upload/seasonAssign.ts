/**
 * season_config 기반 시즌 문자열 추론 (업로드 핸들러용)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { Tables } from "@/lib/supabase/types";

type SeasonCfgRow = Pick<
  Tables<"season_config">,
  "season" | "start_date" | "end_date" | "is_closed"
>;

function monthStart(isoYm: string): Date {
  const [y, m] = isoYm.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

/** yearMonth(YYYY-MM)이 속한 시즌 */
export function inferSeasonForYm(
  ym: string,
  seasonConfig: SeasonCfgRow[],
  fallback: string | null
): string | null {
  const t = monthStart(ym).getTime();
  for (const c of seasonConfig) {
    const s = new Date(c.start_date).getTime();
    const e = new Date(c.end_date).getTime();
    if (!Number.isNaN(s) && !Number.isNaN(e) && t >= s && t <= e) return c.season;
  }
  return fallback;
}

export function inferSeasonForIsoDate(
  isoDate: string,
  seasonConfig: SeasonCfgRow[],
  fallback: string | null
): string | null {
  return inferSeasonForYm(isoDate.slice(0, 7), seasonConfig, fallback);
}

export async function fetchSeasonConfig(
  supabase: SupabaseClient<Database>
): Promise<SeasonCfgRow[]> {
  const { data, error } = await supabase
    .from("season_config")
    .select("season, start_date, end_date, is_closed")
    .order("start_date", { ascending: true });
  if (error) throw new Error(`시즌 설정을 불러오지 못했습니다: ${error.message}`);
  return data ?? [];
}

/** 진행 중 시즌(is_closed=false) 우선, 없으면 설정 첫 시즌 */
export function pickDefaultSeason(seasonConfig: SeasonCfgRow[]): string | null {
  const open = seasonConfig.filter((c) => c.is_closed === false || c.is_closed === null);
  if (open.length === 1) return open[0]!.season;
  if (open.length > 1) return open[open.length - 1]!.season;
  return seasonConfig[0]?.season ?? null;
}
