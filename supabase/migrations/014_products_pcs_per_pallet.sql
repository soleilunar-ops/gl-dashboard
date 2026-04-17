-- 파렛트당 적재수(쿠팡/수입 출고 기준). MarginCalculator 자동 주입용
-- 앱: 컬럼 NULL이면 useSkuMapping에서 DEFAULT_PCS_PER_PALLET(14400) 폴백 — DB DEFAULT는 두지 않음(의도적 NULL 구분)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS pcs_per_pallet INTEGER;

COMMENT ON COLUMN public.products.pcs_per_pallet IS '1파레트당 적재 수량(매). 포장 단위 선택 시 마진 계산기 자동 입력';
