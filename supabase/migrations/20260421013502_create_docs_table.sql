-- MD 파일 전달용 임시 테이블
CREATE TABLE IF NOT EXISTS public.tmp_docs (
  filename text PRIMARY KEY,
  content  text NOT NULL,
  created_at timestamptz DEFAULT now()
);;
