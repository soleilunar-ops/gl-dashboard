-- 직접 첨부 엑셀 원본 보관용 Storage 경로 + 업로더 — 변경 이유: 이력에서 동일 파일 재다운로드
ALTER TABLE public.order_excel_upload_logs
  ADD COLUMN IF NOT EXISTS storage_path TEXT;

ALTER TABLE public.order_excel_upload_logs
  ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES auth.users (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.order_excel_upload_logs.storage_path IS 'Storage 버킷 order-excel-uploads 내 객체 경로';

COMMENT ON COLUMN public.order_excel_upload_logs.uploaded_by IS '업로드한 로그인 사용자';

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('order-excel-uploads', 'order-excel-uploads', false, 52428800)
ON CONFLICT (id) DO NOTHING;
