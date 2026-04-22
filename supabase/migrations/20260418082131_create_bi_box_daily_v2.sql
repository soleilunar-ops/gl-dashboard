CREATE TABLE bi_box_daily (
  date date NOT NULL,
  sku_id text NOT NULL,
  sku_name text,
  vendor_item_id text NOT NULL,
  vendor_item_name text,
  min_price numeric,
  mid_price numeric,
  max_price numeric,
  bi_box_share numeric,
  is_stockout boolean DEFAULT false,
  unit_price_ok boolean DEFAULT false,
  per_piece_price_ok boolean DEFAULT false,
  attribute_error boolean DEFAULT false,
  source_file text,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (date, sku_id, vendor_item_id)
);

CREATE INDEX idx_bi_box_daily_date ON bi_box_daily(date);
CREATE INDEX idx_bi_box_daily_sku ON bi_box_daily(sku_id);
CREATE INDEX idx_bi_box_daily_stockout ON bi_box_daily(is_stockout) WHERE is_stockout = true;

COMMENT ON TABLE bi_box_daily IS '쿠팡 Supplier Hub > Supply Analysis 엑셀에서 추출한 일별 바이박스 분석 데이터. sku_master와 독립 (바이박스 SKU 범위가 넓음). PK: (date, sku_id, vendor_item_id).';
COMMENT ON COLUMN bi_box_daily.sku_id IS '쿠팡 SKU ID. sku_master에 없는 값도 존재 (FK 미설정).';
COMMENT ON COLUMN bi_box_daily.vendor_item_id IS '쿠팡 벤더 아이템 ID. 하나의 SKU가 여러 vendor_item을 가질 수 있어 PK에 포함.';
COMMENT ON COLUMN bi_box_daily.bi_box_share IS '바이박스 점유율. 원본은 ''100.0000%'' 문자열이지만 100으로 저장 (0-100 범위).';
COMMENT ON COLUMN bi_box_daily.unit_price_ok IS '원본 "단위가격 조건" 필드. 쿠팡 단위가격 표기 요건 충족 여부.';
COMMENT ON COLUMN bi_box_daily.per_piece_price_ok IS '원본 "개당가격 조건" 필드.';
COMMENT ON COLUMN bi_box_daily.attribute_error IS '원본 "상품속성 오류" 필드.';

ALTER TABLE bi_box_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all_bi_box_daily" ON bi_box_daily
  FOR ALL TO authenticated USING (true) WITH CHECK (true);;
