-- ============================================================================
-- orders.tx_type·stock_movement.movement_type 에 production_in 추가 및 트리거 반영
-- 변경 이유: 생산 입고(자체 제조·외주·생산입고조회) 거래가 승인 시 재고 +(입고) 반영
-- ============================================================================

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_tx_type_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_tx_type_check
  CHECK (
    tx_type IN (
      'purchase',
      'sale',
      'return_purchase',
      'return_sale',
      'production_in'
    )
  );

COMMENT ON COLUMN public.orders.tx_type IS
  'purchase/sale/return_purchase/return_sale/production_in. 생산 입고는 production_in(+재고). 음수 수량은 return_* + 절대값 권장.';

ALTER TABLE public.stock_movement DROP CONSTRAINT IF EXISTS stock_movement_movement_type_check;

ALTER TABLE public.stock_movement
  ADD CONSTRAINT stock_movement_movement_type_check
  CHECK (
    movement_type IN (
      'base_set',
      'purchase',
      'sale',
      'return_purchase',
      'return_sale',
      'manual_adjust',
      'production_in'
    )
  );

COMMENT ON COLUMN public.stock_movement.quantity_delta IS
  '부호: purchase/return_sale/production_in(+), sale/return_purchase(-), base_set(초기), manual_adjust(양·음 자유).';

CREATE OR REPLACE FUNCTION public.trg_orders_to_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_delta         INTEGER;
  v_last_stock    INTEGER;
  v_movement_type TEXT;
  v_base_date     DATE;
BEGIN
  SELECT base_date INTO v_base_date
  FROM item_master
  WHERE item_id = NEW.item_id;

  IF NEW.tx_date <= v_base_date THEN
    RETURN NEW;
  END IF;

  IF NEW.is_internal = TRUE THEN
    RETURN NEW;
  END IF;

  CASE NEW.tx_type
    WHEN 'purchase'        THEN v_delta :=  NEW.quantity; v_movement_type := 'purchase';
    WHEN 'sale'            THEN v_delta := -NEW.quantity; v_movement_type := 'sale';
    WHEN 'return_purchase' THEN v_delta := -NEW.quantity; v_movement_type := 'return_purchase';
    WHEN 'return_sale'     THEN v_delta :=  NEW.quantity; v_movement_type := 'return_sale';
    WHEN 'production_in'   THEN v_delta :=  NEW.quantity; v_movement_type := 'production_in';
  END CASE;

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
$function$;

COMMENT ON FUNCTION public.trg_orders_to_stock_movement() IS
  'orders INSERT 시 stock_movement 자동 생성. tx_date<=base_date 또는 is_internal 이면 skip. production_in 은 입고(+).';
