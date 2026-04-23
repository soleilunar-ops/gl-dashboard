
-- 1. source_table, source_id 컬럼 추가
ALTER TABLE public.orders 
  ADD COLUMN source_table TEXT,
  ADD COLUMN source_id BIGINT;

-- 2. 기존 9,118건을 'legacy'로 마킹 (source_id는 기존 orders.id 사용)
UPDATE public.orders 
SET source_table = 'legacy',
    source_id = id
WHERE source_table IS NULL;

-- 3. CHECK 제약 (오타 방어)
ALTER TABLE public.orders 
  ADD CONSTRAINT orders_source_table_check 
  CHECK (source_table IN (
    'ecount_sales', 
    'ecount_purchase', 
    'ecount_stock_ledger',
    'ecount_production_receipt',
    'ecount_production_outsource',
    'manual', 
    'legacy'
  ));

-- 4. source_table NOT NULL 제약
ALTER TABLE public.orders 
  ALTER COLUMN source_table SET NOT NULL;

-- 5. UNIQUE 제약 (UPSERT 중복 방지)
ALTER TABLE public.orders 
  ADD CONSTRAINT orders_source_unique 
  UNIQUE (source_table, source_id);

-- 6. 조회 인덱스
CREATE INDEX IF NOT EXISTS idx_orders_source 
  ON public.orders(source_table, source_id);
;
