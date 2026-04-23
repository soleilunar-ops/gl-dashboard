-- 변경 이유: 생산입고 데이터를 일자별로 조회/집계하기 위해 doc_date 컬럼을 추가합니다.
ALTER TABLE public.ecount_production_receipt
ADD COLUMN IF NOT EXISTS doc_date DATE;

CREATE INDEX IF NOT EXISTS idx_ecount_production_receipt_doc_date
  ON public.ecount_production_receipt (company_code, doc_date DESC);

