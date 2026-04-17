-- ============================================================
-- 012_order_excel_upload_logs.sql
-- 변경 이유: 엑셀 업로드 팝업에서 이전 파일 기록을 조회할 수 있도록 업로드 이력 테이블을 추가합니다.
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

ALTER TABLE public.order_excel_upload_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_excel_upload_logs_select_all" ON public.order_excel_upload_logs;
CREATE POLICY "order_excel_upload_logs_select_all"
  ON public.order_excel_upload_logs
  FOR SELECT
  USING (true);
