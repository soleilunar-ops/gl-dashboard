
-- 이카운트 5개 테이블
ALTER TABLE public.ecount_sales 
  ADD COLUMN IF NOT EXISTS upload_id BIGINT REFERENCES public.excel_uploads(id) ON DELETE SET NULL;
ALTER TABLE public.ecount_purchase 
  ADD COLUMN IF NOT EXISTS upload_id BIGINT REFERENCES public.excel_uploads(id) ON DELETE SET NULL;
ALTER TABLE public.ecount_production_receipt 
  ADD COLUMN IF NOT EXISTS upload_id BIGINT REFERENCES public.excel_uploads(id) ON DELETE SET NULL;
ALTER TABLE public.ecount_production_outsource 
  ADD COLUMN IF NOT EXISTS upload_id BIGINT REFERENCES public.excel_uploads(id) ON DELETE SET NULL;
ALTER TABLE public.ecount_stock_ledger 
  ADD COLUMN IF NOT EXISTS upload_id BIGINT REFERENCES public.excel_uploads(id) ON DELETE SET NULL;

-- 쿠팡 4개 테이블
ALTER TABLE public.daily_performance 
  ADD COLUMN IF NOT EXISTS upload_id BIGINT REFERENCES public.excel_uploads(id) ON DELETE SET NULL;
ALTER TABLE public.inventory_operation 
  ADD COLUMN IF NOT EXISTS upload_id BIGINT REFERENCES public.excel_uploads(id) ON DELETE SET NULL;
ALTER TABLE public.regional_sales 
  ADD COLUMN IF NOT EXISTS upload_id BIGINT REFERENCES public.excel_uploads(id) ON DELETE SET NULL;
ALTER TABLE public.noncompliant_delivery 
  ADD COLUMN IF NOT EXISTS upload_id BIGINT REFERENCES public.excel_uploads(id) ON DELETE SET NULL;
ALTER TABLE public.coupang_delivery_detail 
  ADD COLUMN IF NOT EXISTS upload_id BIGINT REFERENCES public.excel_uploads(id) ON DELETE SET NULL;
ALTER TABLE public.coupang_daily_performance 
  ADD COLUMN IF NOT EXISTS upload_id BIGINT REFERENCES public.excel_uploads(id) ON DELETE SET NULL;

-- 비용 4개 테이블
ALTER TABLE public.promotion_milkrun_costs 
  ADD COLUMN IF NOT EXISTS upload_id BIGINT REFERENCES public.excel_uploads(id) ON DELETE SET NULL;
ALTER TABLE public.promotion_ad_costs 
  ADD COLUMN IF NOT EXISTS upload_id BIGINT REFERENCES public.excel_uploads(id) ON DELETE SET NULL;
ALTER TABLE public.promotion_coupon_contracts 
  ADD COLUMN IF NOT EXISTS upload_id BIGINT REFERENCES public.excel_uploads(id) ON DELETE SET NULL;
ALTER TABLE public.promotion_premium_data_costs 
  ADD COLUMN IF NOT EXISTS upload_id BIGINT REFERENCES public.excel_uploads(id) ON DELETE SET NULL;

-- 인덱스 (upload_id 기반 조회 최적화)
CREATE INDEX IF NOT EXISTS idx_ecount_sales_upload_id ON public.ecount_sales(upload_id) WHERE upload_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ecount_purchase_upload_id ON public.ecount_purchase(upload_id) WHERE upload_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ecount_production_receipt_upload_id ON public.ecount_production_receipt(upload_id) WHERE upload_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ecount_production_outsource_upload_id ON public.ecount_production_outsource(upload_id) WHERE upload_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ecount_stock_ledger_upload_id ON public.ecount_stock_ledger(upload_id) WHERE upload_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_daily_performance_upload_id ON public.daily_performance(upload_id) WHERE upload_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_operation_upload_id ON public.inventory_operation(upload_id) WHERE upload_id IS NOT NULL;
;
