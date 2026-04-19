-- Restored from Supabase schema_migrations (version 20260419161440)
-- Original migration name: m7_ecount_production_outsource_trigger


CREATE OR REPLACE FUNCTION public.trg_ecount_production_outsource_to_orders()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_item_id       BIGINT;
  v_unit_count    INTEGER;
  v_quantity      INTEGER;
BEGIN
  -- ① 매칭 (sales/purchase와 동일: erp_code + 원팩 필터)
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

  -- 매칭 실패 → 스킵
  IF v_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- ② 생산 관련은 내부거래 판정 스킵 (counterparty 무관하게 재고 증가 방향)
  -- ③ qty=0 또는 음수는 스킵 (생산입고는 양수만 의미 있음)
  IF NEW.qty IS NULL OR NEW.qty <= 0 THEN
    RETURN NEW;
  END IF;

  v_quantity := NEW.qty::INTEGER * v_unit_count;

  -- ④ UPSERT
  INSERT INTO orders (
    tx_date, item_id, erp_system, tx_type,
    erp_code, erp_tx_no, erp_item_name_raw, counterparty,
    quantity, unit_price, supply_amount, vat, total_amount, memo,
    status, source_table, source_id
  ) VALUES (
    NEW.doc_date, v_item_id, NEW.company_code, 'production_in',
    NEW.erp_code, NEW.doc_no, NEW.product_name, NEW.counterparty,
    v_quantity, NEW.unit_price, NEW.supply_amount, NEW.vat_amount, NEW.total_amount, NEW.memo,
    'pending', 'ecount_production_outsource', NEW.id
  )
  ON CONFLICT (source_table, source_id) DO UPDATE SET
    tx_date = EXCLUDED.tx_date,
    item_id = EXCLUDED.item_id,
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

DROP TRIGGER IF EXISTS trg_ecount_production_outsource_ai ON public.ecount_production_outsource;
CREATE TRIGGER trg_ecount_production_outsource_ai
AFTER INSERT OR UPDATE ON public.ecount_production_outsource
FOR EACH ROW
EXECUTE FUNCTION public.trg_ecount_production_outsource_to_orders();
