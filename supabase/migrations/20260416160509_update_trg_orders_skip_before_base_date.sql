-- ============================================================================
-- 트리거 수정: 4/9 이전 거래는 stock_movement 생성 skip
-- 배경:
--   - 일일재고현황 실사 기준일 = 2026-04-08
--   - 4/8까지의 재고는 item_master.base_stock_qty에 이미 반영됨 (실사값)
--   - 4/9 이후 거래만 재고 변동 기록 대상
--   - 4/8 이전 거래는 orders에 저장되지만 분석/이력 조회용, 재고 계산 제외
-- ============================================================================

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
  -- [신규] 해당 item의 base_date 조회
  SELECT base_date INTO v_base_date
  FROM item_master
  WHERE item_id = NEW.item_id;

  -- [신규] base_date 이전 거래는 stock_movement 생성하지 않음
  -- (과거 발주/구매 이력으로 orders에는 남지만, 재고 계산에서는 제외)
  IF NEW.tx_date <= v_base_date THEN
    RETURN NEW;
  END IF;

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
$function$;

COMMENT ON FUNCTION public.trg_orders_to_stock_movement() IS
'orders INSERT 시 stock_movement 자동 생성. 단, (1) tx_date <= item_master.base_date(실사일)이면 skip(과거 이력용), (2) is_internal=TRUE이면 skip(내부거래), 두 경우 모두 orders 자체는 저장됨.';
