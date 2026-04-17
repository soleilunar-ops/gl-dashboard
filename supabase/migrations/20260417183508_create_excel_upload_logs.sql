-- ============================================================
-- 20260418033406_create_excel_upload_logs.sql
-- 변경 이유: 엑셀 업로드 팝업에서 이전 파일 기록을 조회할 수 있도록 업로드 이력 테이블 추가.
-- 2026-04-18 PM 재작성: 2단 RLS(authenticated) 정책 일관성 반영.
--   원본: supabase/migrations/012_order_excel_upload_logs.sql (슬아 작성, 미적용 상태였음)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.order_excel_upload_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_code TEXT NOT NULL,
  file_name TEXT NOT NULL,
  total_input INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_excel_upload_logs_company_created
  ON public.order_excel_upload_logs(company_code, created_at DESC);

COMMENT ON TABLE public.order_excel_upload_logs IS '엑셀 업로드 이력 — 팝업에서 최근 업로드 파일 조회용. /api/orders/bulk-import-purchase-excel 라우트가 INSERT 기록.';
COMMENT ON COLUMN public.order_excel_upload_logs.company_code IS 'gl / gl_pharm / hnb';

-- 2단 RLS: 전 테이블 공통 'Allow all for authenticated users' 정책 적용
ALTER TABLE public.order_excel_upload_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for authenticated users"
  ON public.order_excel_upload_logs;

CREATE POLICY "Allow all for authenticated users"
  ON public.order_excel_upload_logs
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
