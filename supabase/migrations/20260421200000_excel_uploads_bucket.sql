-- 직접 첨부 엑셀 원본 — 변경 이유: 앱 기본 버킷명 excel-uploads (기존 order-excel-uploads 와 병행 가능)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('excel-uploads', 'excel-uploads', false, 52428800)
ON CONFLICT (id) DO NOTHING;

COMMENT ON COLUMN public.order_excel_upload_logs.storage_path IS 'Storage 버킷 excel-uploads 내 객체 경로';
