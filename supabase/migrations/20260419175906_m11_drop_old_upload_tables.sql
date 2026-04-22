
-- 기존 업로드 이력 테이블 2개 삭제 (excel_uploads로 통합)
DROP TABLE IF EXISTS public.upload_history CASCADE;
DROP TABLE IF EXISTS public.order_excel_upload_logs CASCADE;
;
