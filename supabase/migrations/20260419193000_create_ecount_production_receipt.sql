-- 이카운트 생산입고조회 엑셀 적재 (scripts/ecount_crawler.py --menu production_receipt)
CREATE TABLE IF NOT EXISTS public.ecount_production_receipt (
  id              BIGSERIAL PRIMARY KEY,
  receipt_no      TEXT,
  factory_name    TEXT,
  warehouse_name  TEXT,
  product_name    TEXT,
  qty             NUMERIC(18, 4),
  work_order      TEXT,
  company_code    TEXT NOT NULL,
  date_from       TEXT NOT NULL,
  date_to         TEXT NOT NULL,
  crawled_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ecount_production_receipt_company_dates
  ON public.ecount_production_receipt (company_code, date_from, date_to);

COMMENT ON TABLE public.ecount_production_receipt IS 'Ecount 생산입고조회 엑셀 크롤 결과. 동일 company_code+date_from+date_to 재적재 시 기존 행 삭제 후 삽입.';

GRANT SELECT ON TABLE public.ecount_production_receipt TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ecount_production_receipt TO service_role;
