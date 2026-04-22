-- ============================================================
-- 핫팩 시즌 분석 자동화 레이어
-- 데이터(쿠팡 판매, 기상) 갱신 시 아래 VIEW는 자동 반영됨
-- ============================================================

-- 1) 핫팩 SKU 동적 분류 뷰
-- 새 SKU가 sku_master에 들어와도 규칙에 따라 자동 분류됨
CREATE OR REPLACE VIEW public.v_hotpack_skus AS
SELECT
  sku_id, sku_name, brand,
  CASE
    WHEN sku_name LIKE '%붙이는%'                              THEN 'stick_on'     -- 붙이는형
    WHEN sku_name LIKE '%찜질%' OR sku_name LIKE '%온열팩%'  THEN 'warmth_pad'   -- 찜질/온열형
    WHEN sku_name LIKE '%선물세트%'                            THEN 'gift_set'     -- 선물세트
    ELSE                                                            'handwarmer'   -- 손난로형 (기본)
  END AS category
FROM public.sku_master
WHERE detail_category = '보온소품'
  AND (sku_name LIKE '%핫팩%' OR sku_name LIKE '%손난로%'
    OR sku_name LIKE '%온열팩%' OR sku_name LIKE '%온찜질팩%')
  AND sku_name NOT LIKE '%발바닥%'
  AND sku_name NOT LIKE '%발가락%'
  AND sku_name NOT LIKE '%발난로%'
  AND sku_name NOT LIKE '%발열귀마개%';

COMMENT ON VIEW public.v_hotpack_skus IS '핫팩류 SKU 동적 마스터. 발 관련 제외, 4개 카테고리 자동 분류.';


-- 2) 시즌별 일별 통합 데이터 (모든 시즌 스택)
-- season_config 에 시즌 추가만 하면 새 시즌 자동 편입
CREATE OR REPLACE VIEW public.v_hotpack_season_daily AS
SELECT
  sc.season,
  wx.weather_date                             AS date,
  EXTRACT(DOW FROM wx.weather_date)::int      AS dow,
  (wx.weather_date - sc.start_date)::int      AS day_of_season,
  wx.temp_min,
  wx.temp_avg,
  wx.temp_max,
  (wx.temp_max - wx.temp_min)                 AS diurnal_range,
  COALESCE(wx.snowfall, 0)                    AS snowfall,
  COALESCE(wx.precipitation, 0)               AS precipitation,
  wx.humidity_avg,
  COALESCE(s.units_sold, 0)                   AS units_sold,
  COALESCE(s.gmv, 0)                          AS gmv,
  COALESCE(s.order_count, 0)                  AS order_count,
  COALESCE(s.page_views, 0)                   AS page_views
FROM public.season_config sc
JOIN public.weather_unified wx
  ON wx.weather_date BETWEEN sc.start_date AND sc.end_date
 AND wx.station = '서울' AND wx.source = 'asos'
LEFT JOIN LATERAL (
  SELECT
    SUM(dp.units_sold)  AS units_sold,
    SUM(dp.gmv)         AS gmv,
    SUM(dp.order_count) AS order_count,
    SUM(dp.page_views)  AS page_views
  FROM public.daily_performance dp
  WHERE dp.sale_date = wx.weather_date
    AND dp.sku_id IN (SELECT sku_id FROM public.v_hotpack_skus)
) s ON TRUE;

COMMENT ON VIEW public.v_hotpack_season_daily IS '시즌×일별 핫팩 판매+서울 기상 통합. 쿠팡/기상 데이터 갱신 시 자동 반영.';


-- 3) 시즌 요약 통계 (한 행 = 한 시즌)
CREATE OR REPLACE VIEW public.v_hotpack_season_stats AS
WITH base AS (
  SELECT * FROM public.v_hotpack_season_daily
),
peak AS (
  SELECT DISTINCT ON (season) season, date AS peak_date, units_sold AS peak_units, temp_min AS peak_tmin
  FROM base
  ORDER BY season, units_sold DESC NULLS LAST
)
SELECT
  b.season,
  MIN(b.date)                                                     AS season_start,
  MAX(b.date)                                                     AS season_end,
  COUNT(*)                                                        AS days_in_data,
  SUM(b.units_sold)                                               AS total_units,
  SUM(b.gmv)                                                      AS total_gmv,
  ROUND(AVG(b.units_sold))                                        AS avg_daily_units,
  p.peak_date,
  p.peak_units,
  p.peak_tmin,
  ROUND(CORR(b.temp_min, b.units_sold)::numeric, 3)               AS r_linear,
  ROUND(CORR(b.temp_min, LN(GREATEST(b.units_sold,1)))::numeric, 3) AS r_log,
  MIN(b.date) FILTER (WHERE b.temp_min <  10)                     AS first_sub_10,
  MIN(b.date) FILTER (WHERE b.temp_min <   5)                     AS first_sub_5,
  MIN(b.date) FILTER (WHERE b.temp_min <   0)                     AS first_freeze,
  MIN(b.date) FILTER (WHERE b.temp_min <  -5)                     AS first_sub_minus_5,
  MIN(b.date) FILTER (WHERE b.temp_min < -10)                     AS first_arctic,
  MIN(b.temp_min)                                                 AS season_lowest_temp,
  MAX(b.temp_max)                                                 AS season_highest_temp
FROM base b
LEFT JOIN peak p ON p.season = b.season
GROUP BY b.season, p.peak_date, p.peak_units, p.peak_tmin;

COMMENT ON VIEW public.v_hotpack_season_stats IS '시즌별 요약 KPI. 자동 갱신.';


-- 4) 현재/가장 최신 시즌 헬퍼 함수
-- 오늘이 시즌 중이면 그 시즌, 오프시즌이면 가장 최근 종료 시즌 반환
CREATE OR REPLACE FUNCTION public.fn_current_season()
RETURNS TABLE(season varchar, start_date date, end_date date, status text)
LANGUAGE sql STABLE AS $$
  SELECT season, start_date, end_date,
    CASE
      WHEN CURRENT_DATE BETWEEN start_date AND end_date THEN 'active'
      WHEN CURRENT_DATE < start_date                     THEN 'upcoming'
      ELSE                                                    'closed'
    END AS status
  FROM public.season_config
  ORDER BY
    CASE
      WHEN CURRENT_DATE BETWEEN start_date AND end_date THEN 1  -- 진행 중
      WHEN CURRENT_DATE < start_date                     THEN 3  -- 예정
      ELSE                                                    2  -- 종료
    END,
    end_date DESC
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.fn_current_season() IS '현재 또는 가장 최근 시즌 반환 (active/upcoming/closed).';


-- 5) 최근 데이터 커버리지 확인 뷰 (운영용)
CREATE OR REPLACE VIEW public.v_hotpack_data_freshness AS
SELECT
  'coupang_sales'::text AS source,
  MAX(sale_date)        AS latest_date,
  (CURRENT_DATE - MAX(sale_date)) AS days_behind
FROM public.daily_performance
UNION ALL
SELECT
  'weather_asos_seoul',
  MAX(weather_date),
  (CURRENT_DATE - MAX(weather_date))
FROM public.weather_unified
WHERE station='서울' AND source='asos';

COMMENT ON VIEW public.v_hotpack_data_freshness IS '데이터 최신성 체크. 갱신 지연 모니터링용.';;
