-- ============================================================
-- L2-1. orders (3 ERP 구매/판매/반품 통합, 144개 밖 거래는 버림)
-- ============================================================
CREATE TABLE orders (
  id                   BIGSERIAL PRIMARY KEY,
  tx_date              DATE NOT NULL,
  item_id              BIGINT NOT NULL REFERENCES item_master(item_id) ON DELETE RESTRICT,
  erp_system           TEXT NOT NULL CHECK (erp_system IN ('gl','gl_farm','hnb')),
  tx_type              TEXT NOT NULL CHECK (tx_type IN ('purchase','sale','return_purchase','return_sale')),
  erp_code             TEXT,  -- NULL 허용: GL 판매는 품목코드 없음 (역매칭)
  erp_tx_no            TEXT,
  erp_item_name_raw    TEXT,
  counterparty         TEXT,
  is_internal          BOOLEAN NOT NULL DEFAULT FALSE,
  quantity             INTEGER NOT NULL,
  unit_price           NUMERIC(12,2),
  supply_amount        NUMERIC(14,2),
  vat                  NUMERIC(14,2),
  total_amount         NUMERIC(14,2),
  memo                 TEXT,
  crawled_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 중복방지 (크롤러 재실행시 동일 거래 INSERT 방지)
  -- GL 판매는 erp_tx_no+erp_code가 NULL일 수 있어 item_id/quantity 포함
  UNIQUE (erp_system, erp_tx_no, item_id, erp_code, quantity)
);

CREATE INDEX idx_orders_tx_date ON orders(tx_date DESC);
CREATE INDEX idx_orders_item_date ON orders(item_id, tx_date);
CREATE INDEX idx_orders_system_type ON orders(erp_system, tx_type);
CREATE INDEX idx_orders_is_external ON orders(is_internal) WHERE is_internal = FALSE;
CREATE INDEX idx_orders_counterparty ON orders(counterparty);

COMMENT ON TABLE orders IS 'GL/지엘팜/HNB 3개 ERP의 구매/판매/반품 통합 거래. 144개 item_master에 매칭된 거래만 저장 (밖은 버림).';
COMMENT ON COLUMN orders.is_internal IS '내부거래 플래그: 3법인 상호간 거래면 TRUE, stock_movement에 반영 안 함.';
COMMENT ON COLUMN orders.tx_type IS 'purchase/sale/return_purchase/return_sale. 음수 수량은 크롤러가 return_* + 절대값으로 변환.';
COMMENT ON COLUMN orders.quantity IS '양수로 저장. 재고 변동 방향은 tx_type이 결정.';
