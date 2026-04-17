
-- 경쟁사 상품 조사 데이터 (쿠팡 검색결과 크롤링/API 수집용)
CREATE TABLE public.competitor_products (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  collected_at        date NOT NULL,
  search_keyword      text,
  category            text NOT NULL,
  rank                integer,
  product_name        text NOT NULL,
  brand               text,
  release_date        date,
  rating              numeric(3,2),
  review_count        integer DEFAULT 0,
  impression_count    integer DEFAULT 0,
  click_count         integer DEFAULT 0,
  click_rate          numeric(5,4),
  item_winner_price   numeric,
  coupang_product_id  text,
  created_at          timestamptz DEFAULT now()
);

COMMENT ON TABLE public.competitor_products IS
  '쿠팡 검색결과 기반 경쟁사 상품 조사 데이터. 팀원이 API로 수집. 손난로/핫팩 카테고리 경쟁사 순위/가격/리뷰 추적용.';
COMMENT ON COLUMN public.competitor_products.collected_at IS '데이터 수집/입력일';
COMMENT ON COLUMN public.competitor_products.search_keyword IS '검색 기준 키워드 (예: 핫팩, 손난로). rank/impression/click의 기준.';
COMMENT ON COLUMN public.competitor_products.category IS '카테고리: 손난로 또는 핫팩';
COMMENT ON COLUMN public.competitor_products.rank IS '해당 검색어 기준 카테고리 내 순위';
COMMENT ON COLUMN public.competitor_products.impression_count IS '검색노출수';
COMMENT ON COLUMN public.competitor_products.click_count IS '클릭수';
COMMENT ON COLUMN public.competitor_products.click_rate IS '클릭률 (CTR, 0~1 사이 소수)';
COMMENT ON COLUMN public.competitor_products.item_winner_price IS '아이템위너 가격 (쿠팡 최저가 노출 가격)';
COMMENT ON COLUMN public.competitor_products.coupang_product_id IS '쿠팡 상품 ID (중복 방지 및 시계열 추적용)';

CREATE INDEX idx_competitor_date_cat
  ON public.competitor_products(collected_at, category);
CREATE INDEX idx_competitor_rank
  ON public.competitor_products(collected_at, category, rank);
CREATE INDEX idx_competitor_product_id
  ON public.competitor_products(coupang_product_id);

ALTER TABLE public.competitor_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated users"
  ON public.competitor_products
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
