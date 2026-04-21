-- ============================================================
-- L2-2. stock_movement (재고변동 시계열 로그, 트리거로 자동 INSERT)
-- ============================================================
CREATE TABLE stock_movement (
  id             BIGSERIAL PRIMARY KEY,
  item_id        BIGINT NOT NULL REFERENCES item_master(item_id) ON DELETE CASCADE,
  movement_date  DATE NOT NULL,
  movement_type  TEXT NOT NULL CHECK (movement_type IN ('base_set','purchase','sale','return_purchase','return_sale','manual_adjust')),
  quantity_delta INTEGER NOT NULL,
  running_stock  INTEGER,
  source_table   TEXT NOT NULL,
  source_id      BIGINT,
  erp_system     TEXT,
  memo           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 재고 조회 최적화 (item_id + movement_date + id 순서로 running_stock 누적)
CREATE INDEX idx_stock_movement_item_date ON stock_movement(item_id, movement_date, id);
CREATE INDEX idx_stock_movement_date ON stock_movement(movement_date DESC);
CREATE INDEX idx_stock_movement_type ON stock_movement(movement_type);

COMMENT ON TABLE stock_movement IS '재고 변동 시계열 로그. orders INSERT 트리거로 자동 생성. 쿠팡 inventory_operation과 별개(태생 다름).';
COMMENT ON COLUMN stock_movement.quantity_delta IS '부호: purchase/return_sale(+), sale/return_purchase(-), base_set(초기), manual_adjust(양/음 자유).';
COMMENT ON COLUMN stock_movement.running_stock IS '이 변동 이후 누적재고. 트리거가 직전 running_stock + delta로 계산.';
COMMENT ON COLUMN stock_movement.source_table IS 'orders / item_master / manual.';
