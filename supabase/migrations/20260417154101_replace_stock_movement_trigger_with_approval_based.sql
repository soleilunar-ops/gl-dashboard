-- Restored from Supabase schema_migrations (version 20260417154101)
-- Original migration name: replace_stock_movement_trigger_with_approval_based

-- 1) 기존 AFTER INSERT 트리거 제거 (자동 stock_movement 생성 중단)
DROP TRIGGER IF EXISTS after_orders_insert ON orders;

-- 2) 승인 기반 트리거 함수 생성 (status가 approved로 변경될 때만 stock_movement 생성)
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

    -- tx_type → movement_type(한국어) & delta 부호 & memo
    CASE NEW.tx_type
      WHEN 'purchase' THEN
        v_delta := NEW.quantity;
        v_movement_type := '입고';
        v_memo := COALESCE(NEW.counterparty, '') || ' 구매';
      WHEN 'sale' THEN
        v_delta := -NEW.quantity;
        v_movement_type := '출고';
        v_memo := COALESCE(NEW.counterparty, '') || ' 판매';
      WHEN 'return_sale' THEN
        v_delta := NEW.quantity;
        v_movement_type := '입고';
        v_memo := COALESCE(NEW.counterparty, '') || ' 반품';
      WHEN 'return_purchase' THEN
        v_delta := -NEW.quantity;
        v_movement_type := '출고';
        v_memo := COALESCE(NEW.counterparty, '') || ' 반품';
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

  -- CASE C: pending → rejected / rejected → pending / 기타 전이 (재고 변동 없음)
  RETURN NEW;
END;
$$;

-- 3) 트리거 생성 (status 컬럼이 실제 변경될 때만)
CREATE TRIGGER after_orders_status_change
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION trg_orders_approval_to_stock_movement();

COMMENT ON FUNCTION trg_orders_approval_to_stock_movement() IS
  '실무자가 orders.status를 변경할 때 stock_movement를 자동 생성/삭제. approved→pending/rejected 시 삭제, pending/rejected→approved 시 생성.';
