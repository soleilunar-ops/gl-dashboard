CREATE OR REPLACE VIEW v_weather_daily_state AS
SELECT
  season, date, units_sold, temp_min, temp_max, temp_avg, diurnal_range,
  COALESCE(snowfall, 0::numeric) AS snowfall,
  COALESCE(precipitation, 0::numeric) AS precipitation,
  temp_min <= -12 AS is_cold_wave,
  temp_max < 0::numeric AS is_freeze,
  COALESCE(snowfall, 0::numeric) > 0::numeric AS is_snow,
  diurnal_range >= 10::numeric AS is_big_tdiff,
  (COALESCE(precipitation, 0::numeric) > 0::numeric AND COALESCE(snowfall, 0::numeric) = 0::numeric) AS is_rain_only,
  temp_max >= 15::numeric AS is_warm,
  CASE
    WHEN temp_max < 0::numeric THEN 'A_freeze'::text
    WHEN temp_max < 5::numeric THEN 'B_cold'::text
    WHEN temp_max < 10::numeric THEN 'C_cool'::text
    WHEN temp_max < 15::numeric THEN 'D_mild'::text
    ELSE 'E_warm'::text
  END AS tmax_bin,
  CASE
    WHEN diurnal_range < 8::numeric THEN 'small'::text
    WHEN diurnal_range < 12::numeric THEN 'medium'::text
    ELSE 'large'::text
  END AS tdiff_bin,
  (temp_max BETWEEN 0::numeric AND 10::numeric AND diurnal_range BETWEEN 8::numeric AND 12::numeric) AS is_cold_and_big_diff
FROM v_hotpack_season_daily d;

CREATE OR REPLACE VIEW v_weather_state_lift AS
WITH base AS (
  SELECT season, AVG(units_sold) AS avg_season
  FROM v_weather_daily_state
  WHERE units_sold IS NOT NULL
  GROUP BY season
), unpvt AS (
  SELECT season, 'cold_wave'::text AS state_key, '한파 (tmin≤-12)'::text AS state_label, units_sold, is_cold_wave AS flag FROM v_weather_daily_state
  UNION ALL
  SELECT season, 'freeze', '영하일 (tmax<0)', units_sold, is_freeze FROM v_weather_daily_state
  UNION ALL
  SELECT season, 'snow', '강설 (snow>0)', units_sold, is_snow FROM v_weather_daily_state
  UNION ALL
  SELECT season, 'big_tdiff', '큰 일교차 (tdiff≥10)', units_sold, is_big_tdiff FROM v_weather_daily_state
  UNION ALL
  SELECT season, 'rain_only', '강우 (rain, no snow)', units_sold, is_rain_only FROM v_weather_daily_state
  UNION ALL
  SELECT season, 'warm', '따뜻 (tmax≥15)', units_sold, is_warm FROM v_weather_daily_state
  UNION ALL
  SELECT season, 'cold_and_big_diff', '선선+큰 일교차 (tmax 0~10 · tdiff 8~12)', units_sold, is_cold_and_big_diff FROM v_weather_daily_state
)
SELECT u.season, u.state_key, u.state_label,
  COUNT(*) FILTER (WHERE u.flag) AS fired_days,
  ROUND(AVG(u.units_sold) FILTER (WHERE u.flag))::integer AS avg_when_fired,
  ROUND(b.avg_season)::integer AS avg_season,
  ROUND(AVG(u.units_sold) FILTER (WHERE u.flag) / NULLIF(b.avg_season, 0::numeric), 2) AS multiplier
FROM unpvt u JOIN base b USING (season)
WHERE u.units_sold IS NOT NULL
GROUP BY u.season, u.state_key, u.state_label, b.avg_season
ORDER BY u.season, (ROUND(AVG(u.units_sold) FILTER (WHERE u.flag) / NULLIF(b.avg_season, 0::numeric), 2)) DESC NULLS LAST;;
