-- 1) 26시즌 판매 끝난 시점(2026-12-04) 이후 서울 날씨 삭제 (실측·예보 전부)
DELETE FROM weather_unified
WHERE station = '서울'
  AND weather_date > '2026-12-04'
  AND weather_date <= '2027-03-31';

-- 2) v_hotpack_season_stats 재정의: 판매 있는 날만 집계 → season_end, avg, peak, first_freeze 등 자동으로 실제 구간 반영
CREATE OR REPLACE VIEW v_hotpack_season_stats AS
WITH base AS (
  SELECT * FROM v_hotpack_season_daily WHERE units_sold > 0
), peak AS (
  SELECT DISTINCT ON (season) season, date AS peak_date, units_sold AS peak_units, temp_min AS peak_tmin
  FROM base ORDER BY season, units_sold DESC NULLS LAST
)
SELECT b.season,
  MIN(b.date) AS season_start,
  MAX(b.date) AS season_end,
  COUNT(*) AS days_in_data,
  SUM(b.units_sold) AS total_units,
  SUM(b.gmv) AS total_gmv,
  ROUND(AVG(b.units_sold)) AS avg_daily_units,
  p.peak_date, p.peak_units, p.peak_tmin,
  ROUND(corr(b.temp_min::double precision, b.units_sold::double precision)::numeric, 3) AS r_linear,
  ROUND(corr(b.temp_min::double precision, ln(GREATEST(b.units_sold, 1::bigint)::double precision))::numeric, 3) AS r_log,
  MIN(b.date) FILTER (WHERE b.temp_min < 10) AS first_sub_10,
  MIN(b.date) FILTER (WHERE b.temp_min < 5) AS first_sub_5,
  MIN(b.date) FILTER (WHERE b.temp_min < 0) AS first_freeze,
  MIN(b.date) FILTER (WHERE b.temp_min < -5) AS first_sub_minus_5,
  MIN(b.date) FILTER (WHERE b.temp_min < -10) AS first_arctic,
  MIN(b.temp_min) AS season_lowest_temp,
  MAX(b.temp_max) AS season_highest_temp
FROM base b
LEFT JOIN peak p ON p.season::text = b.season::text
GROUP BY b.season, p.peak_date, p.peak_units, p.peak_tmin;;
