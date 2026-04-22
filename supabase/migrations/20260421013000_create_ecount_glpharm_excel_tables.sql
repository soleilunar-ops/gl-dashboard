-- 변경 이유: 지엘팜 구매/판매 엑셀 적재를 기존 공용 테이블과 분리 저장하기 위해 전용 테이블을 생성합니다.

CREATE TABLE IF NOT EXISTS public.ecount_glpharm_purchase_excel (
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

CREATE INDEX IF NOT EXISTS idx_ecount_glpharm_purchase_excel_company_dates
  ON public.ecount_glpharm_purchase_excel (company_code, date_from, date_to);

CREATE INDEX IF NOT EXISTS idx_ecount_glpharm_purchase_excel_doc_date
  ON public.ecount_glpharm_purchase_excel (company_code, doc_date DESC);

GRANT SELECT ON TABLE public.ecount_glpharm_purchase_excel TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ecount_glpharm_purchase_excel TO service_role;


CREATE TABLE IF NOT EXISTS public.ecount_glpharm_sales_excel (
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

CREATE INDEX IF NOT EXISTS idx_ecount_glpharm_sales_excel_company_dates
  ON public.ecount_glpharm_sales_excel (company_code, date_from, date_to);

CREATE INDEX IF NOT EXISTS idx_ecount_glpharm_sales_excel_doc_date
  ON public.ecount_glpharm_sales_excel (company_code, doc_date DESC);

GRANT SELECT ON TABLE public.ecount_glpharm_sales_excel TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ecount_glpharm_sales_excel TO service_role;
