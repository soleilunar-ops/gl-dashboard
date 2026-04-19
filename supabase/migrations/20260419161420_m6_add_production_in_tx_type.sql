-- Restored from Supabase schema_migrations (version 20260419161420)
-- Original migration name: m6_add_production_in_tx_type


-- 1. orders.tx_type CHECK 제약 재생성 (production_in 추가)
ALTER TABLE public.orders 
  DROP CONSTRAINT IF EXISTS orders_tx_type_check;

ALTER TABLE public.orders 
  ADD CONSTRAINT orders_tx_type_check 
  CHECK (tx_type IN (
    'purchase', 
    'sale', 
    'return_purchase', 
    'return_sale',
    'production_in'
  ));

-- 2. stock_movement.movement_type CHECK 제약 재생성 (production_in 추가)
ALTER TABLE public.stock_movement 
  DROP CONSTRAINT IF EXISTS stock_movement_movement_type_check;

ALTER TABLE public.stock_movement 
  ADD CONSTRAINT stock_movement_movement_type_check 
  CHECK (movement_type IN (
    'purchase', 
    'sale', 
    'return_sale', 
    'return_purchase', 
    'base_set', 
    'manual_adjust',
    'production_in'
  ));

-- 3. stock_movement 생성 트리거 함수 업데이트 (production_in 분기 추가)
CREATE OR REPLACE FUNCTION public.trg_orders_approval_to_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
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

    -- tx_type을 movement_type에 1:1 매핑
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
      WHEN 'production_in' THEN
        v_delta := NEW.quantity;
        v_movement_type := 'production_in';
        v_memo := COALESCE(NEW.counterparty, '') || ' 생산입고';
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

  RETURN NEW;
END;
$function$;
