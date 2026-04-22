-- 지엘 생산입고조회 크롤 결과 (날짜 UI 비조작, 엑셀 기준)
-- DELETE: company_code + date_from + date_to (조회 메타 일치)

CREATE TABLE IF NOT EXISTS public.ecount_production_receipt (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    company_code TEXT NOT NULL,
    receipt_no TEXT,
    factory_name TEXT,
    warehouse_name TEXT,
    product_name TEXT,
    qty NUMERIC,
    work_order TEXT,
    date_from DATE NOT NULL,
    date_to DATE NOT NULL,
    crawled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ecount_pr_company_period
    ON public.ecount_production_receipt (company_code, date_from, date_to);

COMMENT ON TABLE public.ecount_production_receipt IS '이카운트 생산입고조회 엑셀 적재 (지엘 전용 메뉴)';
