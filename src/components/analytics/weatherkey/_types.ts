import type { Database, Tables } from "@/lib/supabase/types";

// Supabase generate_typescript_types는 Views helper를 자동 export하지 않아 자체 정의.
type Views<T extends keyof Database["public"]["Views"]> = Database["public"]["Views"][T]["Row"];

// 뷰 Row 타입 alias
export type SeasonDaily = Views<"v_hotpack_season_daily">;
export type SeasonStats = Views<"v_hotpack_season_stats">;
export type HotpackSkusRow = Views<"v_hotpack_skus">;
export type TriggerDay = Views<"v_hotpack_triggers">;
export type TriggerEffect = Views<"v_hotpack_trigger_effects">;
export type WeatherStateLift = Views<"v_weather_state_lift">;
export type DataFreshness = Views<"v_hotpack_data_freshness">;
export type CronJobStatus = Views<"v_cron_job_status">;
export type KeywordDailyWithMa = Views<"v_keyword_daily_with_ma">;
export type KeywordTrendsActive = Views<"v_keyword_trends_active">;

// 테이블 Row 타입 alias
export type WeatherUnified = Tables<"weather_unified">;
export type SeasonConfig = Tables<"season_config">;
export type KeywordCatalog = Tables<"keyword_catalog">;
export type TriggerConfig = Tables<"trigger_config">;
export type StationCatalog = Tables<"station_catalog">;

// fn_current_season() 반환 한 행 (Returns: {...}[])
type FnCurrentSeasonRow = Database["public"]["Functions"]["fn_current_season"]["Returns"][number];

// status 문자열을 좁혀 쓰기 위한 타입
export type SeasonStatus = "active" | "upcoming" | "closed";

export type CurrentSeasonInfo = Omit<FnCurrentSeasonRow, "status"> & {
  status: SeasonStatus;
};

// weather_unified.source 값 3종
export type WeatherSource = "asos" | "forecast_short" | "forecast_mid" | "era5";

// 훅 공통 반환 shape (섹션별 skeleton/에러 처리 일관성용)
export type HookResult<T> = {
  data: T;
  loading: boolean;
  error: string | null;
  refetch: () => void;
};
