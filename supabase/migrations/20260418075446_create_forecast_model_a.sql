CREATE TABLE forecast_model_a (
  sku_id text NOT NULL,
  week_start date NOT NULL,
  model_version text NOT NULL DEFAULT 'round4',
  weekly_sales_qty_forecast numeric NOT NULL,
  lower_bound numeric,
  upper_bound numeric,
  confidence_interval numeric DEFAULT 0.95,
  features_used jsonb,
  used_synthetic boolean DEFAULT false,
  generated_at timestamptz DEFAULT now(),
  PRIMARY KEY (sku_id, week_start, model_version),
  FOREIGN KEY (sku_id) REFERENCES sku_master(sku_id)
);

CREATE INDEX idx_fma_week ON forecast_model_a(week_start);
CREATE INDEX idx_fma_generated ON forecast_model_a(generated_at DESC);
CREATE INDEX idx_fma_version ON forecast_model_a(model_version);

COMMENT ON TABLE forecast_model_a IS 'Model A (LightGBM) 주간 SKU 판매 예측. model_version으로 round1~round4 등 배치 구분.';
COMMENT ON COLUMN forecast_model_a.used_synthetic IS '학습 시 synthetic_2024 합성 데이터 사용 여부. 합성 포함/미포함 모델 성능 비교용.';
COMMENT ON COLUMN forecast_model_a.features_used IS '사용된 피처 리스트 (lag, cold_days_7d 등) JSONB 기록';

ALTER TABLE forecast_model_a ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all_forecast_model_a" ON forecast_model_a
  FOR ALL TO authenticated USING (true) WITH CHECK (true);;
