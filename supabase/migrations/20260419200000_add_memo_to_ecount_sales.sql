-- 판매 엑셀의 '적요' → memo (기존 DB에 없을 수 있음)
ALTER TABLE public.ecount_sales
    ADD COLUMN IF NOT EXISTS memo TEXT;
