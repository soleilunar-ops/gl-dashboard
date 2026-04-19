-- Restored from Supabase schema_migrations (version 20260419182323)
-- Original migration name: m13_add_unique_indexes_to_production_tables


-- ecount_production_outsource UNIQUE 인덱스
-- (sales/purchase와 동일한 키 구조)
CREATE UNIQUE INDEX IF NOT EXISTS uq_ecount_production_outsource_unique
ON public.ecount_production_outsource 
USING btree (company_code, doc_date, doc_no, erp_code, counterparty, qty, unit_price);

-- ecount_production_receipt UNIQUE 인덱스
-- (receipt_no 기준, NULL 허용 컬럼은 COALESCE로 처리)
CREATE UNIQUE INDEX IF NOT EXISTS uq_ecount_production_receipt_unique
ON public.ecount_production_receipt 
USING btree (
  company_code, 
  COALESCE(receipt_no, ''),
  COALESCE(factory_name, ''),
  COALESCE(product_name, ''),
  qty, 
  COALESCE(work_order, ''),
  date_from
);
