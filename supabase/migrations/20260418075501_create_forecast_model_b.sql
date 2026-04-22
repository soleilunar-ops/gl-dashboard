CREATE TABLE forecast_model_b (
  id bigserial PRIMARY KEY,
  week_start date NOT NULL,
  product_category text NOT NULL,
  sku_id text,
  pred_ratio numeric,
  pred_linear numeric,
  distributed_qty numeric,
  model_version text NOT NULL DEFAULT 'v1',
  lookback_weeks integer DEFAULT 4,
  distribute_weeks integer DEFAULT 2,
  used_synthetic boolean DEFAULT false,
  generated_at timestamptz DEFAULT now(),
  FOREIGN KEY (sku_id) REFERENCES sku_master(sku_id)
);

CREATE UNIQUE INDEX idx_fmb_unique ON forecast_model_b(
  week_start, product_category, COALESCE(sku_id, ''), model_version
);
CREATE INDEX idx_fmb_week ON forecast_model_b(week_start);
CREATE INDEX idx_fmb_sku ON forecast_model_b(sku_id) WHERE sku_id IS NOT NULL;
CREATE INDEX idx_fmb_version ON forecast_model_b(model_version);

COMMENT ON TABLE forecast_model_b IS 'Model B (비율 기반) 카테고리+SKU 발주 예측. sku_id=NULL은 카테고리 총량, 값 있으면 SKU 분배량.';
COMMENT ON COLUMN forecast_model_b.sku_id IS 'NULL이면 카테고리 레벨 예측, 값 있으면 SKU 분배 row';
COMMENT ON COLUMN forecast_model_b.lookback_weeks IS '비율 계산에 쓰인 직전 N주 (기본 4)';
COMMENT ON COLUMN forecast_model_b.distribute_weeks IS 'SKU 분배 기준 주 수 (기본 2)';

ALTER TABLE forecast_model_b ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all_forecast_model_b" ON forecast_model_b
  FOR ALL TO authenticated USING (true) WITH CHECK (true);;
