-- 생산외주(E040410) 크롤 결과 — ecount_purchase 와 동일 컬럼 세트로 분리 저장 (DELETE 충돌 방지)

CREATE TABLE IF NOT EXISTS public.ecount_production_outsource (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    company_code TEXT NOT NULL,
    doc_date DATE,
    doc_no TEXT,
    erp_code TEXT,
    product_name TEXT,
    spec TEXT,
    qty NUMERIC,
    unit_price NUMERIC,
    unit_price_vat NUMERIC,
    supply_amount NUMERIC,
    vat_amount NUMERIC,
    total_amount NUMERIC,
    counterparty TEXT,
    memo TEXT,
    date_from DATE,
    date_to DATE,
    crawled_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ecount_po_company_docdate
    ON public.ecount_production_outsource (company_code, doc_date);

COMMENT ON TABLE public.ecount_production_outsource IS '이카운트 생산외주(E040410) 엑셀 적재';
