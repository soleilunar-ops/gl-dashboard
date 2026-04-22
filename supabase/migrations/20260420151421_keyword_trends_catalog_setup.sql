-- ============================================================
-- 네이버 검색 트렌드 데이터 저장소
-- 판매 급증 트리거 검증을 위한 선행 지표
-- ============================================================

-- 1) 키워드 카탈로그 (추적 대상 정의)
CREATE TABLE IF NOT EXISTS public.keyword_catalog (
  keyword       TEXT PRIMARY KEY,
  category      TEXT NOT NULL CHECK (category IN ('primary','variant','substitute','related')),
  display_name  TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.keyword_catalog IS '네이버 트렌드 추적 대상 키워드 정의.';
COMMENT ON COLUMN public.keyword_catalog.category IS 'primary=총괄 / variant=타입별 선행지표 / substitute=대체재 / related=참고용';
COMMENT ON COLUMN public.keyword_catalog.is_active IS 'FALSE면 분석 뷰에서 자동 제외됩니다.';

-- 초기 5개 키워드 시드
INSERT INTO public.keyword_catalog (keyword, category, display_name, notes) VALUES
  ('핫팩',         'primary',    '핫팩',         '총괄 관심도 — 시즌 시작·피크 포착'),
  ('붙이는 핫팩',  'variant',    '붙이는 핫팩',  'stick_on 카테고리 선행지표'),
  ('손난로 핫팩',  'variant',    '손난로 핫팩',  'handwarmer 카테고리 선행지표 (한파 폭발형)'),
  ('발바닥 파스',  'substitute', '발바닥 파스',  '대체재 (발바닥 SKU는 분석 제외지만 관심도는 참고)'),
  ('보온 물주머니','substitute', '보온 물주머니','전통 보온 수단 대체재')
ON CONFLICT (keyword) DO NOTHING;


-- 2) 일별 검색지수 시계열
CREATE TABLE IF NOT EXISTS public.keyword_trends (
  id            BIGSERIAL PRIMARY KEY,
  trend_date    DATE NOT NULL,
  keyword       TEXT NOT NULL REFERENCES public.keyword_catalog(keyword) ON UPDATE CASCADE,
  search_index  NUMERIC(6,2) NOT NULL CHECK (search_index >= 0 AND search_index <= 100),
  source        TEXT NOT NULL DEFAULT 'naver_datalab',
  issued_date   DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trend_date, keyword, source)
);

CREATE INDEX IF NOT EXISTS idx_kw_trends_date         ON public.keyword_trends(trend_date);
CREATE INDEX IF NOT EXISTS idx_kw_trends_keyword_date ON public.keyword_trends(keyword, trend_date);

COMMENT ON TABLE  public.keyword_trends IS '네이버 데이터랩 등 외부 소스의 키워드 일별 상대 검색지수 (0~100).';
COMMENT ON COLUMN public.keyword_trends.search_index IS '해당 데이터 추출 기간 내 최댓값=100 기준 상대지수. 다른 키워드와 직접 비교 불가.';
COMMENT ON COLUMN public.keyword_trends.issued_date  IS '데이터를 추출·업로드한 날짜 (재추출 추적용).';


-- 3) 적재 후 편의 뷰 — "활성 키워드만"
CREATE OR REPLACE VIEW public.v_keyword_trends_active AS
SELECT
  t.trend_date,
  t.keyword,
  c.category,
  c.display_name,
  t.search_index,
  t.source,
  t.issued_date
FROM public.keyword_trends t
JOIN public.keyword_catalog c USING (keyword)
WHERE c.is_active = TRUE;

COMMENT ON VIEW public.v_keyword_trends_active IS '활성 키워드만 필터링한 트렌드 시계열.';;
