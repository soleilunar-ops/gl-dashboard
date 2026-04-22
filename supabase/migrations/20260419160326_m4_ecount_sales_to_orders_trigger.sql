
CREATE OR REPLACE FUNCTION public.trg_ecount_sales_to_orders()
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
  -- ① 매칭: (erp_system, erp_code) → item_id
  --    원팩만 대상 (쿠팡/홈쇼핑 번들 마스터 제외)
  --    제조년도 중복 시 seq_no 낮은 것 우선
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

  -- 매칭 실패 → 스킵 (144 밖 or 번들만 매핑)
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

  -- 내부거래 → 스킵
  IF v_is_internal THEN
    RETURN NEW;
  END IF;

  -- ③ 반품 판정 + 매수 환산
  IF NEW.qty < 0 THEN
    v_tx_type := 'return_sale';
    v_quantity := ABS(NEW.qty)::INTEGER * v_unit_count;
  ELSIF NEW.qty > 0 THEN
    v_tx_type := 'sale';
    v_quantity := NEW.qty::INTEGER * v_unit_count;
  ELSE
    -- qty=0은 샘플/증정, 스킵
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
    'pending', 'ecount_sales', NEW.id
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
DROP TRIGGER IF EXISTS trg_ecount_sales_ai ON public.ecount_sales;
CREATE TRIGGER trg_ecount_sales_ai
AFTER INSERT OR UPDATE ON public.ecount_sales
FOR EACH ROW
EXECUTE FUNCTION public.trg_ecount_sales_to_orders();
;
