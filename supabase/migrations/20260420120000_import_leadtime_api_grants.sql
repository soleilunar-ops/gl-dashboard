-- 변경 이유: PostgREST(브라우저 Supabase 클라이언트)가 authenticated·service_role로 import_leadtime에 접근할 수 있게 합니다.
-- RLS 정책만으로는 부족할 때가 있어 테이블 권한을 명시합니다.
DO $$
BEGIN
  IF to_regclass('public.import_leadtime') IS NULL THEN
    RETURN;
  END IF;
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.import_leadtime TO authenticated;
  GRANT ALL ON TABLE public.import_leadtime TO service_role;
END $$;
