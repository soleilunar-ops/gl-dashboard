-- Restored from Supabase schema_migrations (version 20260419175841)
-- Original migration name: m9_create_excel_storage_bucket


-- 1. excel-uploads 버킷 생성 (비공개, 50MB 제한, 엑셀/CSV만 허용)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'excel-uploads',
  'excel-uploads',
  false,
  52428800,  -- 50MB
  ARRAY[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
    'application/octet-stream'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS 정책: 인증된 사용자만 업로드
DROP POLICY IF EXISTS "excel_uploads_authenticated_insert" ON storage.objects;
CREATE POLICY "excel_uploads_authenticated_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'excel-uploads');

-- 3. RLS 정책: 인증된 사용자만 조회/다운로드
DROP POLICY IF EXISTS "excel_uploads_authenticated_select" ON storage.objects;
CREATE POLICY "excel_uploads_authenticated_select"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'excel-uploads');

-- 4. RLS 정책: 인증된 사용자만 삭제 (롤백 필요 시)
DROP POLICY IF EXISTS "excel_uploads_authenticated_delete" ON storage.objects;
CREATE POLICY "excel_uploads_authenticated_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'excel-uploads');

-- 5. service_role은 자동으로 RLS 우회 (서버사이드 크롤러/스크립트용);
