-- storage_path를 NULL 허용으로 변경
-- 이유: 프로모션 업로드 핸들러(uploadHistoryLog)는 파일 파싱 후 메타만 기록하고
--       Storage 버킷 업로드 로직은 향후 단계에서 추가 예정. 그 전까지 storage_path는 NULL로 둠.
ALTER TABLE public.excel_uploads ALTER COLUMN storage_path DROP NOT NULL;;
