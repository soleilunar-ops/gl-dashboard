-- 수입 리드타임: ①③ 단계 수기 예상일 저장 (테이블이 이미 있을 때만 추가)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'import_leadtime'
  ) THEN
    ALTER TABLE public.import_leadtime
      ADD COLUMN IF NOT EXISTS step1_expected date,
      ADD COLUMN IF NOT EXISTS step3_expected date;
  END IF;
END $$;
