CREATE OR REPLACE VIEW v_hotpack_season_daily AS
SELECT sc.season,
  d.weather_date AS date,
  EXTRACT(dow FROM d.weather_date)::integer AS dow,
  (d.weather_date - sc.start_date) AS day_of_season,
  wx.temp_min, wx.temp_avg, wx.temp_max,
  (wx.temp_max - wx.temp_min) AS diurnal_range,
  COALESCE(wx.snowfall, 0::numeric) AS snowfall,
  COALESCE(wx.precipitation, 0::numeric) AS precipitation,
  wx.humidity_avg,
  COALESCE(s.units_sold, 0::bigint) AS units_sold,
  COALESCE(s.gmv, 0::numeric) AS gmv,
  COALESCE(s.order_count, 0::bigint) AS order_count,
  COALESCE(s.page_views, 0::bigint) AS page_views
FROM season_config sc
JOIN LATERAL (
  SELECT DISTINCT weather_date
  FROM weather_unified
  WHERE station = '서울'
    AND source IN ('asos', 'forecast_short', 'forecast_mid', 'era5')
    AND weather_date >= sc.start_date
    AND weather_date <= sc.end_date
) d ON TRUE
LEFT JOIN LATERAL (
  SELECT w.temp_min, w.temp_avg, w.temp_max, w.snowfall, w.precipitation, w.humidity_avg
  FROM weather_unified w
  WHERE w.weather_date = d.weather_date
    AND w.station = '서울'
    AND w.source IN ('asos', 'forecast_short', 'forecast_mid', 'era5')
  ORDER BY CASE w.source
    WHEN 'asos' THEN 0
    WHEN 'forecast_short' THEN 1
    WHEN 'forecast_mid' THEN 2
    ELSE 3
  END
  LIMIT 1
) wx ON TRUE
LEFT JOIN LATERAL (
  SELECT SUM(dp.units_sold) AS units_sold,
         SUM(dp.gmv) AS gmv,
         SUM(dp.order_count) AS order_count,
         SUM(dp.page_views) AS page_views
  FROM daily_performance dp
  WHERE dp.sale_date = d.weather_date
    AND dp.sku_id IN (SELECT sku_id FROM v_hotpack_skus)
) s ON TRUE;;
