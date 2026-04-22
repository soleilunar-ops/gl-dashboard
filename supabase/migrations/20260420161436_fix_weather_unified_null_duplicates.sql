-- ============================================================
-- weather_unified: issued_date=NULL 중복 정리 + 제약 NULLS NOT DISTINCT 적용
-- 원인: 기본 UNIQUE는 NULLS DISTINCT라 NULL끼리 중복 허용됨
-- ============================================================

-- 1) 중복 제거: precipitation 값이 더 풍부한(NOT NULL) 행 우선 유지
DELETE FROM public.weather_unified
WHERE ctid IN (
  SELECT ctid FROM (
    SELECT 
      ctid,
      ROW_NUMBER() OVER (
        PARTITION BY weather_date, station, source, issued_date
        ORDER BY 
          (precipitation IS NOT NULL) DESC,
          (humidity_avg IS NOT NULL) DESC,
          ctid DESC
      ) AS rn
    FROM public.weather_unified
  ) t
  WHERE rn > 1
);

-- 2) 기존 UNIQUE 제약 제거 후 NULLS NOT DISTINCT로 재생성 (PG15+)
ALTER TABLE public.weather_unified DROP CONSTRAINT uq_weather;
ALTER TABLE public.weather_unified 
  ADD CONSTRAINT uq_weather 
  UNIQUE NULLS NOT DISTINCT (weather_date, station, source, issued_date);

COMMENT ON CONSTRAINT uq_weather ON public.weather_unified IS 
  'NULLS NOT DISTINCT로 설정. issued_date=NULL(실측) 끼리도 중복 판정하여 upsert 안정성 확보.';;
