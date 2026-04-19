-- Restored from Supabase schema_migrations (version 20260419160342)
-- Original migration name: m5_ecount_purchase_to_orders_trigger


CREATE OR REPLACE FUNCTION public.trg_ecount_purchase_to_orders()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_item_id       BIGINT;
  v_unit_count    INTEGER;
  v_tx_type       TEXT;
  v_quantity      INTEGER;
  v_is_internal   BOOLEAN;
BEGIN
  -- ① 매칭 (sales와 동일 규칙)
  SELECT im.item_id, COALESCE(im.unit_count, 1)
    INTO v_item_id, v_unit_count
  FROM item_erp_mapping iem
  JOIN item_master im ON iem.item_id = im.item_id
  WHERE iem.erp_system = NEW.company_code
    AND iem.erp_code = NEW.erp_code
    AND im.item_name_raw !~ '\(쿠팡\)'
    AND im.item_name_raw !~ '\(홈쇼핑(용)?\)'
    AND im.is_active = TRUE
  ORDER BY im.seq_no ASC
  LIMIT 1;

  IF v_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- ② 내부거래 판정
  SELECT EXISTS(
    SELECT 1 FROM internal_entities
    WHERE is_active = TRUE
      AND ((match_type = 'exact' AND pattern = TRIM(NEW.counterparty))
        OR (match_type = 'contains' AND TRIM(COALESCE(NEW.counterparty, '')) LIKE '%' || pattern || '%')
        OR (match_type = 'regex' AND TRIM(COALESCE(NEW.counterparty, '')) ~ pattern))
  ) INTO v_is_internal;

  IF v_is_internal THEN
    RETURN NEW;
  END IF;

  -- ③ 반품 판정 + 매수 환산
  IF NEW.qty < 0 THEN
    v_tx_type := 'return_purchase';
    v_quantity := ABS(NEW.qty)::INTEGER * v_unit_count;
  ELSIF NEW.qty > 0 THEN
    v_tx_type := 'purchase';
    v_quantity := NEW.qty::INTEGER * v_unit_count;
  ELSE
    RETURN NEW;
  END IF;

  -- ④ UPSERT
  INSERT INTO orders (
    tx_date, item_id, erp_system, tx_type,
    erp_code, erp_tx_no, erp_item_name_raw, counterparty,
    quantity, unit_price, supply_amount, vat, total_amount, memo,
    status, source_table, source_id
  ) VALUES (
    NEW.doc_date, v_item_id, NEW.company_code, v_tx_type,
    NEW.erp_code, NEW.doc_no, NEW.product_name, NEW.counterparty,
    v_quantity, NEW.unit_price, NEW.supply_amount, NEW.vat_amount, NEW.total_amount, NEW.memo,
    'pending', 'ecount_purchase', NEW.id
  )
  ON CONFLICT (source_table, source_id) DO UPDATE SET
    tx_date = EXCLUDED.tx_date,
    item_id = EXCLUDED.item_id,
    tx_type = EXCLUDED.tx_type,
    erp_item_name_raw = EXCLUDED.erp_item_name_raw,
    counterparty = EXCLUDED.counterparty,
    quantity = EXCLUDED.quantity,
    unit_price = EXCLUDED.unit_price,
    supply_amount = EXCLUDED.supply_amount,
    vat = EXCLUDED.vat,
    total_amount = EXCLUDED.total_amount,
    memo = EXCLUDED.memo,
    status = CASE 
      WHEN orders.status = 'approved' THEN 'pending'
      ELSE orders.status 
    END;

  RETURN NEW;
END;
$$;

-- 트리거 연결
DROP TRIGGER IF EXISTS trg_ecount_purchase_ai ON public.ecount_purchase;
CREATE TRIGGER trg_ecount_purchase_ai
AFTER INSERT OR UPDATE ON public.ecount_purchase
FOR EACH ROW
EXECUTE FUNCTION public.trg_ecount_purchase_to_orders();
