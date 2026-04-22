-- ============================================================
-- HTML v2 리포트의 정적 상태 분류를 Supabase 뷰로 정규화
-- 목적: 재고·발주 전략 테이블 + 오늘 날씨 상태 해석용
-- ============================================================

-- (1) 일별 상태 태그 (7종 bin)
CREATE OR REPLACE VIEW public.v_weather_daily_state AS
SELECT 
  d.season, d.date, d.units_sold,
  d.temp_min, d.temp_max, d.temp_avg, d.diurnal_range,
  COALESCE(d.snowfall, 0) AS snowfall,
  COALESCE(d.precipitation, 0) AS precipitation,
  -- 7개 정적 상태 플래그
  (d.temp_min <= -12)       AS is_cold_wave,
  (d.temp_max < 0)          AS is_freeze,
  (COALESCE(d.snowfall,0) > 0)              AS is_snow,
  (d.diurnal_range >= 10)   AS is_big_tdiff,
  (COALESCE(d.precipitation,0) > 0 AND COALESCE(d.snowfall,0) = 0) AS is_rain_only,
  (d.temp_max >= 15)        AS is_warm,
  -- tmax 카테고리
  CASE 
    WHEN d.temp_max < 0  THEN 'A_freeze'
    WHEN d.temp_max < 5  THEN 'B_cold'
    WHEN d.temp_max < 10 THEN 'C_cool'
    WHEN d.temp_max < 15 THEN 'D_mild'
    ELSE                      'E_warm'
  END AS tmax_bin,
  -- tdiff 카테고리
  CASE 
    WHEN d.diurnal_range < 8  THEN 'small'
    WHEN d.diurnal_range < 12 THEN 'medium'
    ELSE                           'large'
  END AS tdiff_bin
FROM v_hotpack_season_daily d;

COMMENT ON VIEW public.v_weather_daily_state IS 
  'HTML v2 정적 상태 분류 7종을 플래그로 제공. 오늘 날씨가 어떤 카테고리인지 일괄 판정.';


-- (2) 상태별 판매 Lift 집계 (HTML PART 3 + PART 4 통합)
CREATE OR REPLACE VIEW public.v_weather_state_lift AS
WITH base AS (
  SELECT season, AVG(units_sold) AS avg_season
  FROM v_weather_daily_state
  WHERE units_sold IS NOT NULL
  GROUP BY season
),
unpvt AS (
  SELECT season, 'cold_wave'   AS state_key, '한파 (tmin≤-12)'       AS state_label, units_sold, is_cold_wave   AS flag FROM v_weather_daily_state
  UNION ALL SELECT season, 'freeze',      '영하일 (tmax<0)',         units_sold, is_freeze      FROM v_weather_daily_state
  UNION ALL SELECT season, 'snow',        '강설 (snow>0)',           units_sold, is_snow        FROM v_weather_daily_state
  UNION ALL SELECT season, 'big_tdiff',   '큰 일교차 (tdiff≥10)',    units_sold, is_big_tdiff   FROM v_weather_daily_state
  UNION ALL SELECT season, 'rain_only',   '강우 (rain, no snow)',    units_sold, is_rain_only   FROM v_weather_daily_state
  UNION ALL SELECT season, 'warm',        '따뜻 (tmax≥15)',          units_sold, is_warm        FROM v_weather_daily_state
)
SELECT 
  u.season, u.state_key, u.state_label,
  COUNT(*) FILTER (WHERE u.flag) AS fired_days,
  ROUND(AVG(u.units_sold) FILTER (WHERE u.flag))::int AS avg_when_fired,
  ROUND(b.avg_season)::int AS avg_season,
  ROUND((AVG(u.units_sold) FILTER (WHERE u.flag) / NULLIF(b.avg_season, 0))::numeric, 2) AS multiplier
FROM unpvt u
JOIN base b USING (season)
WHERE u.units_sold IS NOT NULL
GROUP BY u.season, u.state_key, u.state_label, b.avg_season
ORDER BY u.season, multiplier DESC NULLS LAST;

COMMENT ON VIEW public.v_weather_state_lift IS 
  'HTML v2 리포트 PART 3 의 6종 정적 상태별 판매 배수. 재고·발주 lift 테이블용.';


-- (3) tmax × tdiff 이중분류 매트릭스 (HTML PART 4)
CREATE OR REPLACE VIEW public.v_weather_bin_matrix AS
SELECT 
  season, tmax_bin, tdiff_bin,
  COUNT(*) AS n_days,
  ROUND(AVG(units_sold))::int AS avg_units,
  ROUND(MIN(temp_max)::numeric, 1) AS tmax_lo,
  ROUND(MAX(temp_max)::numeric, 1) AS tmax_hi
FROM v_weather_daily_state
WHERE units_sold IS NOT NULL
GROUP BY season, tmax_bin, tdiff_bin
ORDER BY season, tmax_bin, tdiff_bin;

COMMENT ON VIEW public.v_weather_bin_matrix IS 
  'HTML v2 PART 4 의 tmax × 일교차 이중분류 매트릭스. "한랭×중간일교차 +43% 레버효과" 재현.';;
