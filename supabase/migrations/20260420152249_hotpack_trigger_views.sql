-- ============================================================
-- 핫팩 판매 급증 트리거 레이어
-- 임계값 근거: TRIGGER_LOGIC.md 참조
-- ============================================================

-- 트리거 설정 테이블 (임계값을 뷰에서 빼서 관리 용이성 확보)
CREATE TABLE IF NOT EXISTS public.trigger_config (
  trigger_key   TEXT PRIMARY KEY,
  threshold     NUMERIC NOT NULL,
  unit          TEXT,
  description   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.trigger_config IS '트리거 임계값. 여기 값만 바꾸면 뷰 정의 수정 불필요.';

INSERT INTO public.trigger_config (trigger_key, threshold, unit, description) VALUES
  ('cold_shock_tmin_delta', -6,  '℃',   '전일 대비 최저기온 하락 임계값'),
  ('search_spike_ratio',    1.5, 'ratio','키워드 7일 이동평균 대비 배수 임계값 (잠정)')
ON CONFLICT (trigger_key) DO NOTHING;


-- 1) 키워드 일별 + 7일 이동평균 + 배수
CREATE OR REPLACE VIEW public.v_keyword_daily_with_ma AS
SELECT
  t.trend_date,
  t.keyword,
  c.category,
  t.search_index,
  ROUND(AVG(t.search_index) OVER (
    PARTITION BY t.keyword 
    ORDER BY t.trend_date
    ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING
  )::numeric, 2) AS ma_7d,
  ROUND((t.search_index / NULLIF(AVG(t.search_index) OVER (
    PARTITION BY t.keyword
    ORDER BY t.trend_date
    ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING
  ), 0))::numeric, 3) AS ratio_to_ma
FROM public.keyword_trends t
JOIN public.keyword_catalog c USING (keyword)
WHERE c.is_active = TRUE;

COMMENT ON VIEW public.v_keyword_daily_with_ma IS '키워드별 일별 검색지수 + 7일 이동평균(전 7일) + 당일/MA 배수. 데이터 없으면 NULL.';


-- 2) 날짜별 트리거 플래그
CREATE OR REPLACE VIEW public.v_hotpack_triggers AS
WITH d AS (
  SELECT
    season, date, dow, temp_min, temp_max, units_sold,
    LAG(temp_min)   OVER (PARTITION BY season ORDER BY date) AS prev_tmin,
    LAG(units_sold) OVER (PARTITION BY season ORDER BY date) AS prev_units,
    MIN(date) FILTER (WHERE temp_min < 0) OVER (PARTITION BY season) AS first_freeze_date
  FROM public.v_hotpack_season_daily
),
-- 키워드 spike 집계 (어떤 키워드 하나라도 1.5배 초과)
ks AS (
  SELECT 
    trend_date,
    BOOL_OR(ratio_to_ma >= (SELECT threshold FROM trigger_config WHERE trigger_key='search_spike_ratio'))
      AS any_spike,
    BOOL_OR(keyword = '핫팩' AND ratio_to_ma >= (SELECT threshold FROM trigger_config WHERE trigger_key='search_spike_ratio'))
      AS hotpack_spike,
    -- 어떤 키워드가 spike 걸렸는지 (설명용)
    STRING_AGG(keyword, ', ') FILTER (
      WHERE ratio_to_ma >= (SELECT threshold FROM trigger_config WHERE trigger_key='search_spike_ratio')
    ) AS spiked_keywords,
    -- 핫팩 키워드의 배수 (최대 신호 크기)
    MAX(ratio_to_ma) AS max_ratio
  FROM public.v_keyword_daily_with_ma
  GROUP BY trend_date
),
cfg AS (
  SELECT
    (SELECT threshold FROM trigger_config WHERE trigger_key='cold_shock_tmin_delta') AS cs_thr
)
SELECT
  d.season, d.date, d.dow, d.temp_min, d.temp_max, d.units_sold,
  (d.temp_min - d.prev_tmin)::numeric AS tmin_delta,
  -- === 트리거 플래그 ===
  COALESCE(d.temp_min - d.prev_tmin, 999) <= cfg.cs_thr                           AS cold_shock,
  (d.date = d.first_freeze_date AND d.first_freeze_date IS NOT NULL)              AS first_freeze,
  COALESCE(ks.any_spike, FALSE)                                                    AS search_spike_any,
  COALESCE(ks.hotpack_spike, FALSE)                                                AS search_spike_hotpack,
  (COALESCE(d.temp_min - d.prev_tmin, 999) <= cfg.cs_thr 
   AND COALESCE(ks.any_spike, FALSE))                                              AS compound,
  -- === 설명용 필드 ===
  ks.spiked_keywords,
  ks.max_ratio AS max_keyword_ratio,
  d.prev_units
FROM d
CROSS JOIN cfg
LEFT JOIN ks ON ks.trend_date = d.date;

COMMENT ON VIEW public.v_hotpack_triggers IS '날짜별 4개 트리거 플래그 + 설명 컨텍스트. 키워드 데이터 없으면 search_spike는 FALSE.';


-- 3) 시즌별 트리거 효과 검증 (long format)
CREATE OR REPLACE VIEW public.v_hotpack_trigger_effects AS
WITH unpvt AS (
  SELECT season, date, units_sold, 'cold_shock'     AS trigger_key, cold_shock AS fired FROM v_hotpack_triggers
  UNION ALL
  SELECT season, date, units_sold, 'first_freeze',        first_freeze         FROM v_hotpack_triggers
  UNION ALL
  SELECT season, date, units_sold, 'search_spike_any',    search_spike_any     FROM v_hotpack_triggers
  UNION ALL
  SELECT season, date, units_sold, 'search_spike_hotpack', search_spike_hotpack FROM v_hotpack_triggers
  UNION ALL
  SELECT season, date, units_sold, 'compound',            compound             FROM v_hotpack_triggers
),
baseline AS (
  -- 평소 평균: 어떤 트리거도 안 걸린 날
  SELECT season, ROUND(AVG(units_sold)) AS avg_normal
  FROM v_hotpack_triggers
  WHERE NOT cold_shock AND NOT first_freeze AND NOT search_spike_any AND units_sold > 0
  GROUP BY season
)
SELECT
  u.season,
  u.trigger_key,
  COUNT(*) FILTER (WHERE u.fired)                                                  AS fired_days,
  ROUND(AVG(u.units_sold) FILTER (WHERE u.fired))                                   AS avg_when_fired,
  b.avg_normal                                                                      AS avg_baseline,
  ROUND((AVG(u.units_sold) FILTER (WHERE u.fired) / NULLIF(b.avg_normal,0))::numeric, 2) AS multiplier,
  -- 정밀도: 트리거 발동일 중 실제 전일 대비 1.5배 이상 급증한 비율
  ROUND(100.0 * COUNT(*) FILTER (
    WHERE u.fired AND u.units_sold > 0 AND u.units_sold >= (
      SELECT prev_units * 1.5 FROM v_hotpack_triggers t2
      WHERE t2.date = u.date AND t2.season = u.season
    )
  ) / NULLIF(COUNT(*) FILTER (WHERE u.fired AND u.units_sold > 0), 0), 0) AS precision_pct
FROM unpvt u
LEFT JOIN baseline b USING (season)
GROUP BY u.season, u.trigger_key, b.avg_normal
ORDER BY u.season, u.trigger_key;

COMMENT ON VIEW public.v_hotpack_trigger_effects IS '시즌별 × 트리거별 발동 빈도, 판매 배수, 정밀도. 키워드 유입 후 재검증용.';;
