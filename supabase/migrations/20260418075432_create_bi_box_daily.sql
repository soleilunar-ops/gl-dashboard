-- Restored from Supabase schema_migrations (version 20260418075432)
-- Original migration name: create_bi_box_daily

CREATE TABLE bi_box_daily (
  date date NOT NULL,
  sku_id text NOT NULL,
  vendor_item_name text,
  price numeric,
  is_stockout boolean DEFAULT false,
  bi_box_share numeric,
  source_file text,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (date, sku_id),
  FOREIGN KEY (sku_id) REFERENCES sku_master(sku_id)
);

CREATE INDEX idx_bi_box_daily_date ON bi_box_daily(date);
CREATE INDEX idx_bi_box_daily_sku ON bi_box_daily(sku_id);

COMMENT ON TABLE bi_box_daily IS '바이박스 일별 가격/점유율/품절. 쿠팡 마켓 프론트 스크래핑. 주 단위 배치 업로드. 2025 겨울 포함 5개월 커버.';
COMMENT ON COLUMN bi_box_daily.is_stockout IS '품절 여부. inventory_operation.is_stockout은 2026-01부터, 이 컬럼은 2025 겨울 포함.';
COMMENT ON COLUMN bi_box_daily.bi_box_share IS '바이박스(아이템위너) 점유율 0~1';

ALTER TABLE bi_box_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all_bi_box_daily" ON bi_box_daily
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
