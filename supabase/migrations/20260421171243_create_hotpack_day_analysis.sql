CREATE TABLE IF NOT EXISTS hotpack_day_analysis (
  season TEXT NOT NULL,
  date DATE NOT NULL,
  body TEXT NOT NULL,
  model TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (season, date)
);

ALTER TABLE hotpack_day_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read hotpack_day_analysis"
  ON hotpack_day_analysis FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "service role insert hotpack_day_analysis"
  ON hotpack_day_analysis FOR INSERT
  TO service_role
  WITH CHECK (true);

COMMENT ON TABLE hotpack_day_analysis IS '선택일 AI 분석 캐시 (season, date) — 한 번 생성 후 영구 재사용';;
