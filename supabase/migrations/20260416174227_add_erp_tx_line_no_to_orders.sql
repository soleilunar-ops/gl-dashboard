
-- 1) erp_tx_line_no 컬럼 추가 (ERP 전표 내 행번호)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS erp_tx_line_no INTEGER;

-- 2) 기존 UNIQUE 제거
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_erp_system_erp_tx_no_item_id_erp_code_quantity_key;

-- 3) 새 UNIQUE: (erp_system, erp_tx_no, erp_tx_line_no)
--    NULL 허용 위해 PARTIAL UNIQUE INDEX 사용 (erp_tx_no, line_no가 둘 다 NOT NULL일 때만)
CREATE UNIQUE INDEX IF NOT EXISTS orders_erp_tx_unique_idx
  ON orders (erp_system, erp_tx_no, erp_tx_line_no)
  WHERE erp_tx_no IS NOT NULL AND erp_tx_line_no IS NOT NULL;

-- 4) 안전망: 같은 전표 내 (item_id, erp_code, quantity)가 line_no 없이 중복 INSERT 되는 것 방지
--    (line_no가 NULL인 경우 fallback용)
CREATE UNIQUE INDEX IF NOT EXISTS orders_erp_tx_nolineno_idx
  ON orders (erp_system, erp_tx_no, item_id, erp_code, quantity)
  WHERE erp_tx_line_no IS NULL AND erp_tx_no IS NOT NULL;

COMMENT ON COLUMN orders.erp_tx_line_no IS 'ERP 전표 내 행번호 (같은 erp_tx_no 안에서 여러 개별 주문 구분용)';
