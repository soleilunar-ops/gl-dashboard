-- ============================================================
-- 트리거 1: orders INSERT → stock_movement 자동 기록
-- 규칙: is_internal=TRUE는 skip (3법인 통합재고 관점에서 변동 없음)
-- ============================================================
CREATE OR REPLACE FUNCTION trg_orders_to_stock_movement()
RETURNS TRIGGER AS $$
DECLARE
  v_delta         INTEGER;
  v_last_stock    INTEGER;
  v_movement_type TEXT;
BEGIN
  -- 내부거래는 재고 변동 반영 안 함 (3법인 통합재고 원칙)
  IF NEW.is_internal = TRUE THEN
    RETURN NEW;
  END IF;

  -- tx_type → movement_type & delta 부호
  CASE NEW.tx_type
    WHEN 'purchase'        THEN v_delta :=  NEW.quantity; v_movement_type := 'purchase';
    WHEN 'sale'            THEN v_delta := -NEW.quantity; v_movement_type := 'sale';
    WHEN 'return_purchase' THEN v_delta := -NEW.quantity; v_movement_type := 'return_purchase';
    WHEN 'return_sale'     THEN v_delta :=  NEW.quantity; v_movement_type := 'return_sale';
  END CASE;

  -- 직전 running_stock 조회 (없으면 base_stock_qty가 시작점)
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
    COALESCE(NEW.counterparty, '') || ' ' || v_movement_type
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_orders_insert
AFTER INSERT ON orders
FOR EACH ROW
EXECUTE FUNCTION trg_orders_to_stock_movement();

COMMENT ON FUNCTION trg_orders_to_stock_movement() IS 'orders INSERT시 stock_movement에 자동 기록. is_internal=TRUE는 skip.';
