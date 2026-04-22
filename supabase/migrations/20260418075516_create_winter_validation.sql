CREATE TABLE winter_validation (
  id bigserial PRIMARY KEY,
  run_id text NOT NULL,
  grain text NOT NULL CHECK (grain IN ('weekly', 'sku', 'summary')),
  week_start date,
  sku_id text,
  actual numeric,
  predicted numeric,
  abs_error numeric,
  error_pct numeric,
  bias numeric,
  overall_mae numeric,
  winter_mae numeric,
  val_mae_no_synthetic numeric,
  used_synthetic boolean DEFAULT false,
  notes text,
  generated_at timestamptz DEFAULT now(),
  FOREIGN KEY (sku_id) REFERENCES sku_master(sku_id)
);

CREATE INDEX idx_wv_run ON winter_validation(run_id);
CREATE INDEX idx_wv_grain ON winter_validation(grain);
CREATE INDEX idx_wv_week ON winter_validation(week_start) WHERE grain = 'weekly';
CREATE INDEX idx_wv_sku ON winter_validation(sku_id) WHERE grain = 'sku';
CREATE INDEX idx_wv_synthetic ON winter_validation(used_synthetic, run_id);

COMMENT ON TABLE winter_validation IS '겨울 검증 결과. grain으로 weekly/sku/summary 3 레벨 구분. run_id로 검증 실행 구분.';
COMMENT ON COLUMN winter_validation.used_synthetic IS '이 row를 생성한 모델이 합성 2024 데이터로 학습했는지. row 단위로 구분 가능 (옵션 Y).';
COMMENT ON COLUMN winter_validation.val_mae_no_synthetic IS 'Summary grain에서만 사용. 합성 제외 학습 모델의 MAE (비교용).';

ALTER TABLE winter_validation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all_winter_validation" ON winter_validation
  FOR ALL TO authenticated USING (true) WITH CHECK (true);;
