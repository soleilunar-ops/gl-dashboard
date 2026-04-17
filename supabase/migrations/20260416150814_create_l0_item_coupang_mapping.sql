-- ============================================================
-- L0-3. item_coupang_mapping (144 × N 쿠팡SKU, 번들 관계)
-- ============================================================
CREATE TABLE item_coupang_mapping (
  id                 BIGSERIAL PRIMARY KEY,
  item_id            BIGINT NOT NULL REFERENCES item_master(item_id) ON DELETE CASCADE,
  coupang_sku_id     TEXT NOT NULL REFERENCES sku_master(sku_id) ON DELETE CASCADE,
  coupang_product_id TEXT,
  bundle_ratio       INTEGER NOT NULL DEFAULT 1 CHECK (bundle_ratio > 0),
  channel_variant    TEXT,
  mapping_source     TEXT,
  mapping_status     TEXT NOT NULL CHECK (mapping_status IN ('ai_suggested','verified','rejected')) DEFAULT 'ai_suggested',
  verified_by        TEXT,
  verified_at        TIMESTAMPTZ,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (item_id, coupang_sku_id)
);

CREATE INDEX idx_coupang_sku ON item_coupang_mapping(coupang_sku_id);
CREATE INDEX idx_coupang_item ON item_coupang_mapping(item_id);
CREATE INDEX idx_coupang_status ON item_coupang_mapping(mapping_status);

COMMENT ON TABLE item_coupang_mapping IS '144 품목 × 쿠팡 SKU 1:N 매핑 (번들 포함). 기존 sku_master(쿠팡계)의 유일한 접점.';
COMMENT ON COLUMN item_coupang_mapping.bundle_ratio IS '번들 배수. 10매 원팩이 30매 번들로 판매되면 3.';
COMMENT ON COLUMN item_coupang_mapping.mapping_source IS '매핑 출처: glfarm_shopmap / manual / ai.';
