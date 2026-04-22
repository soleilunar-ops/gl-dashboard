CREATE OR REPLACE VIEW v_hotpack_season_stats AS
WITH base AS (
  SELECT * FROM v_hotpack_season_daily WHERE units_sold > 0
), peak AS (
  SELECT DISTINCT ON (season) season,
         date AS peak_date,
         units_sold AS peak_units,
         gmv AS peak_gmv,
         temp_min AS peak_tmin
  FROM base
  ORDER BY season, gmv DESC NULLS LAST
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
  MAX(b.temp_max) AS season_highest_temp,
  p.peak_gmv
FROM base b
LEFT JOIN peak p ON p.season::text = b.season::text
GROUP BY b.season, p.peak_date, p.peak_units, p.peak_gmv, p.peak_tmin;;
