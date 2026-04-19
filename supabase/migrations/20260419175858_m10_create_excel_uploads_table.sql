-- Restored from Supabase schema_migrations (version 20260419175858)
-- Original migration name: m10_create_excel_uploads_table


CREATE TABLE public.excel_uploads (
  id BIGSERIAL PRIMARY KEY,
  
  -- 파일 정보
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  file_size BIGINT,
  file_hash TEXT,
  
  -- 분류 (엑셀 종류)
  category TEXT NOT NULL 
    CHECK (category IN (
      -- 이카운트
      'ecount_sales', 'ecount_purchase', 
      'ecount_production_receipt', 'ecount_production_outsource', 'ecount_stock_ledger',
      -- 쿠팡
      'coupang_daily_performance', 'coupang_inventory', 
      'coupang_delivery', 'coupang_regional_sales',
      -- 비용
      'milkrun_costs', 'ad_costs', 'coupon_contracts', 'premium_data_costs',
      -- 기타
      'weather', 'other'
    )),
  company_code TEXT 
    CHECK (company_code IS NULL OR company_code IN ('gl', 'gl_pharm', 'hnb')),
  period_start DATE,
  period_end DATE,
  
  -- 데이터가 들어간 대상 테이블 (참고용)
  target_table TEXT,
  
  -- 처리 결과
  total_rows INTEGER,
  inserted_rows INTEGER,
  skipped_rows INTEGER,
  error_rows INTEGER,
  
  -- 추적
  uploaded_by TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  error_message TEXT,
  
  processed_at TIMESTAMPTZ,
  
  -- 메모
  notes TEXT
);

-- 조회 인덱스
CREATE INDEX idx_excel_uploads_category_date 
  ON excel_uploads(category, uploaded_at DESC);

CREATE INDEX idx_excel_uploads_status 
  ON excel_uploads(status) WHERE status IN ('pending', 'processing');

CREATE INDEX idx_excel_uploads_company 
  ON excel_uploads(company_code, category, uploaded_at DESC);

-- 코멘트
COMMENT ON TABLE excel_uploads IS 
  '대시보드/크롤러에서 업로드된 엑셀 파일의 메타 이력. 원본은 Storage(excel-uploads 버킷)에 보관.';
