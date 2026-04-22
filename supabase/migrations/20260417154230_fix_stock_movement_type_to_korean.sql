-- 기존 영문 CHECK 제약 제거
ALTER TABLE stock_movement 
  DROP CONSTRAINT IF EXISTS stock_movement_movement_type_check;

-- 한국어 기반 CHECK 제약 추가 (사장님 운영 기준)
-- 입고/출고 (일반 거래) + 기준조정/수동조정 (시스템/관리용)
ALTER TABLE stock_movement
  ADD CONSTRAINT stock_movement_movement_type_check
  CHECK (movement_type IN ('입고', '출고', '기준조정', '수동조정'));

-- 기존 stock_movement에 영문 값이 있다면 한국어로 변환 (현재는 0건이라 영향 없음)
UPDATE stock_movement SET movement_type = '입고'     WHERE movement_type = 'purchase';
UPDATE stock_movement SET movement_type = '출고'     WHERE movement_type = 'sale';
UPDATE stock_movement SET movement_type = '입고'     WHERE movement_type = 'return_sale';
UPDATE stock_movement SET movement_type = '출고'     WHERE movement_type = 'return_purchase';
UPDATE stock_movement SET movement_type = '기준조정' WHERE movement_type = 'base_set';
UPDATE stock_movement SET movement_type = '수동조정' WHERE movement_type = 'manual_adjust';

COMMENT ON COLUMN stock_movement.movement_type IS '재고 이동 유형(한국어): 입고/출고/기준조정/수동조정';;
