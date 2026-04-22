-- 1) 기존 한국어 CHECK 제약 제거
ALTER TABLE stock_movement 
  DROP CONSTRAINT IF EXISTS stock_movement_movement_type_check;

-- 2) 영문 CHECK 제약 복원 (원래 설계대로)
ALTER TABLE stock_movement
  ADD CONSTRAINT stock_movement_movement_type_check
  CHECK (movement_type IN (
    'purchase',        -- 구매 (입고)
    'sale',            -- 판매 (출고)
    'return_sale',     -- 판매반품 (입고, 고객이 돌려줌)
    'return_purchase', -- 구매반품 (출고, 우리가 공급사에 돌려줌)
    'base_set',        -- 기준 재고 설정 (초기값 세팅용)
    'manual_adjust'    -- 수동 조정 (실사 차이 등)
  ));

COMMENT ON COLUMN stock_movement.movement_type IS 
  '재고 이동 유형(영문): purchase/sale/return_sale/return_purchase/base_set/manual_adjust. 한국어 라벨은 뷰 또는 프론트엔드에서 변환.';

-- 3) 트리거 함수 영문 버전으로 복원 + memo만 한국어 유지(사람이 읽는 메모라 OK)
CREATE OR REPLACE FUNCTION trg_orders_approval_to_stock_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_delta         INTEGER;
  v_last_stock    INTEGER;
  v_movement_type TEXT;
  v_base_date     DATE;
  v_memo          TEXT;
BEGIN
  -- CASE A: approved → pending/rejected (승인 취소 = stock_movement 삭제, 재고 복원)
  IF OLD.status = 'approved' AND NEW.status IN ('pending', 'rejected') THEN
    DELETE FROM stock_movement
    WHERE source_table = 'orders'
      AND source_id = NEW.id;
    RETURN NEW;
  END IF;

  -- CASE B: pending/rejected → approved (승인 = stock_movement 생성)
  IF (OLD.status IS NULL OR OLD.status IN ('pending', 'rejected'))
     AND NEW.status = 'approved' THEN

    -- base_date 조회
    SELECT base_date INTO v_base_date
    FROM item_master
    WHERE item_id = NEW.item_id;

    -- base_date 이전 거래는 재고 계산 제외
    IF NEW.tx_date <= v_base_date THEN
      RETURN NEW;
    END IF;

    -- 내부거래는 재고 반영 제외
    IF NEW.is_internal = TRUE THEN
      RETURN NEW;
    END IF;

    -- tx_type을 movement_type에 1:1 매핑 (정보 손실 없음)
    -- memo는 사람이 읽는 용도라 한국어 유지
    CASE NEW.tx_type
      WHEN 'purchase' THEN
        v_delta := NEW.quantity;
        v_movement_type := 'purchase';
        v_memo := COALESCE(NEW.counterparty, '') || ' 구매';
      WHEN 'sale' THEN
        v_delta := -NEW.quantity;
        v_movement_type := 'sale';
        v_memo := COALESCE(NEW.counterparty, '') || ' 판매';
      WHEN 'return_sale' THEN
        v_delta := NEW.quantity;
        v_movement_type := 'return_sale';
        v_memo := COALESCE(NEW.counterparty, '') || ' 판매반품';
      WHEN 'return_purchase' THEN
        v_delta := -NEW.quantity;
        v_movement_type := 'return_purchase';
        v_memo := COALESCE(NEW.counterparty, '') || ' 구매반품';
    END CASE;

    -- 직전 running_stock 조회 (없으면 base_stock_qty 시작)
    SELECT running_stock INTO v_last_stock
    FROM stock_movement
    WHERE item_id = NEW.item_id
    ORDER BY movement_date DESC, id DESC
    LIMIT 1;

    IF v_last_stock IS NULL THEN
      SELECT base_stock_qty INTO v_last_stock
      FROM item_master
      WHERE item_id = NEW.item_id;
    END IF;

    INSERT INTO stock_movement (
      item_id, movement_date, movement_type,
      quantity_delta, running_stock,
      source_table, source_id, erp_system, memo
    ) VALUES (
      NEW.item_id,
      NEW.tx_date,
      v_movement_type,
      v_delta,
      COALESCE(v_last_stock, 0) + v_delta,
      'orders',
      NEW.id,
      NEW.erp_system,
      v_memo
    );

    RETURN NEW;
  END IF;

  -- 기타 전이 (재고 변동 없음)
  RETURN NEW;
END;
$$;;
