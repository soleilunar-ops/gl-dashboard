
-- 5번: impression_count, click_count 기본값 0 제거 (수집 불가 시 NULL 유지)
ALTER TABLE public.competitor_products
  ALTER COLUMN impression_count DROP DEFAULT,
  ALTER COLUMN click_count DROP DEFAULT;

-- 6번: 중복 방지 복합 UNIQUE 추가 (NULL도 중복으로 취급)
ALTER TABLE public.competitor_products
  ADD CONSTRAINT competitor_products_unique_daily
  UNIQUE NULLS NOT DISTINCT (collected_at, category, coupang_product_id);

-- 7번: category 허용값 제한
ALTER TABLE public.competitor_products
  ADD CONSTRAINT competitor_products_category_check
  CHECK (category IN ('손난로', '핫팩'));
