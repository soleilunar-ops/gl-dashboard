CREATE TABLE IF NOT EXISTS public.hotpack_llm_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('season_brief','surge_alert','first_breakthrough','season_closing')),
  body_md text NOT NULL,
  prompt_hash text NOT NULL,
  model text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hotpack_llm_reports_season_kind_at
  ON public.hotpack_llm_reports (season, kind, generated_at DESC);

-- RLS: authenticated 사용자 읽기 허용, 쓰기는 service_role만
ALTER TABLE public.hotpack_llm_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_hotpack_llm_reports" ON public.hotpack_llm_reports;
CREATE POLICY "authenticated_read_hotpack_llm_reports" ON public.hotpack_llm_reports
  FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE public.hotpack_llm_reports IS
  '핫팩 시즌 LLM 분석 리포트 저장소. kind = season_brief | surge_alert | first_breakthrough | season_closing';;
