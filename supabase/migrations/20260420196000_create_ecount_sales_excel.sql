-- 변경 이유: 구매현황 다음 판매현황 엑셀 결과를 전용 테이블에 분리 저장합니다.
CREATE TABLE IF NOT EXISTS public.ecount_sales_excel (
  id              BIGSERIAL PRIMARY KEY,
  doc_date        DATE,
  doc_no          TEXT,
  erp_code        TEXT,
  product_name    TEXT,
  qty             NUMERIC(18, 4),
  unit_price      NUMERIC(18, 4),
  unit_price_vat  NUMERIC(18, 4),
  supply_amount   NUMERIC(18, 4),
  vat_amount      NUMERIC(18, 4),
  total_amount    NUMERIC(18, 4),
  memo            TEXT,
  counterparty    TEXT,
  company_code    TEXT NOT NULL,
  date_from       TEXT NOT NULL,
  date_to         TEXT NOT NULL,
  crawled_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ecount_sales_excel_company_dates
  ON public.ecount_sales_excel (company_code, date_from, date_to);

CREATE INDEX IF NOT EXISTS idx_ecount_sales_excel_doc_date
  ON public.ecount_sales_excel (company_code, doc_date DESC);

GRANT SELECT ON TABLE public.ecount_sales_excel TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ecount_sales_excel TO service_role;
