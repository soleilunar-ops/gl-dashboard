
-- UNIQUE 제약을 (erp_system, tx_type, erp_tx_no, erp_tx_line_no)로 확장
-- 이유: ERP에서 판매/구매가 같은 전표번호를 공유하는 구조 (예: '2024/03/13 -1'이 
-- 판매와 구매에 모두 존재). tx_type을 추가해야 둘 다 적재 가능

-- 기존 UNIQUE 인덱스 제거
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_erp_tx_unique;
DROP INDEX IF EXISTS orders_erp_tx_unique_idx;
DROP INDEX IF EXISTS orders_erp_tx_nolineno_idx;

-- 새 UNIQUE 제약 (PARTIAL INDEX)
CREATE UNIQUE INDEX orders_erp_tx_unique_v2_idx
  ON orders (erp_system, tx_type, erp_tx_no, erp_tx_line_no)
  WHERE erp_tx_no IS NOT NULL AND erp_tx_line_no IS NOT NULL;

CREATE UNIQUE INDEX orders_erp_tx_nolineno_v2_idx
  ON orders (erp_system, tx_type, erp_tx_no, item_id, erp_code, quantity)
  WHERE erp_tx_line_no IS NULL AND erp_tx_no IS NOT NULL;

COMMENT ON INDEX orders_erp_tx_unique_v2_idx IS 
  'tx_type 추가: 판매/구매가 같은 erp_tx_no를 공유할 수 있어서 구분 필요';
;
