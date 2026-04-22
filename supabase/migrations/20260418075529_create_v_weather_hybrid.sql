CREATE OR REPLACE VIEW v_weather_hybrid AS
SELECT 
  a.weather_date,
  a.station,
  a.lat,
  a.lon,
  a.temp_avg,
  a.temp_min,
  a.temp_max,
  a.wind_avg,
  a.wind_direction,
  e.rain,
  e.precipitation,
  e.snowfall,
  e.apparent_temp_avg,
  e.apparent_temp_min,
  e.apparent_temp_max,
  e.humidity_avg
FROM weather_unified a
JOIN weather_unified e 
  ON a.weather_date = e.weather_date 
 AND a.station = e.station
WHERE a.source = 'asos' 
  AND e.source = 'era5';

COMMENT ON VIEW v_weather_hybrid IS 'ASOS(temp, wind) + ERA5(rain, snowfall, precipitation) 하이브리드 뷰. Model A/B 학습 입력용. 5개 관측소 × 2021-04 ~ 2026-04 커버.';;
