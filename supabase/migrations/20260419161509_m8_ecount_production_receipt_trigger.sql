-- Restored from Supabase schema_migrations (version 20260419161509)
-- Original migration name: m8_ecount_production_receipt_trigger


CREATE OR REPLACE FUNCTION public.trg_ecount_production_receipt_to_orders()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_item_id       BIGINT;
  v_unit_count    INTEGER;
  v_quantity      INTEGER;
  v_tx_date       DATE;
BEGIN
  -- ① product_name 기반 fuzzy 매칭
  --    우선순위: 1) item_erp_mapping.erp_item_name 일치
  --              2) item_master.item_name_raw 일치
  --    원팩만 대상, seq_no 낮은 것 우선
  SELECT im.item_id, COALESCE(im.unit_count, 1)
    INTO v_item_id, v_unit_count
  FROM item_erp_mapping iem
  JOIN item_master im ON iem.item_id = im.item_id
  WHERE iem.erp_system = NEW.company_code
    AND TRIM(iem.erp_item_name) = TRIM(NEW.product_name)
    AND im.item_name_raw !~ '\(쿠팡\)'
    AND im.item_name_raw !~ '\(홈쇼핑(용)?\)'
    AND im.is_active = TRUE
  ORDER BY im.seq_no ASC
  LIMIT 1;

  -- 1차 매칭 실패 시 item_master.item_name_raw로 재시도
  IF v_item_id IS NULL THEN
    SELECT im.item_id, COALESCE(im.unit_count, 1)
      INTO v_item_id, v_unit_count
    FROM item_master im
    WHERE TRIM(im.item_name_raw) = TRIM(NEW.product_name)
      AND im.item_name_raw !~ '\(쿠팡\)'
      AND im.item_name_raw !~ '\(홈쇼핑(용)?\)'
      AND im.is_active = TRUE
    ORDER BY im.seq_no ASC
    LIMIT 1;
  END IF;

  -- 매칭 실패 → 스킵 (로그 용도로 향후 테이블 추가 가능)
  IF v_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- ② 생산 관련은 내부거래 판정 스킵
  -- ③ qty 검증 (양수만 의미 있음)
  IF NEW.qty IS NULL OR NEW.qty <= 0 THEN
    RETURN NEW;
  END IF;

  v_quantity := NEW.qty::INTEGER * v_unit_count;

  -- ④ tx_date: production_receipt에는 doc_date가 없고 date_to 사용
  v_tx_date := COALESCE(NEW.date_to, NEW.date_from, CURRENT_DATE);

  -- ⑤ UPSERT
  INSERT INTO orders (
    tx_date, item_id, erp_system, tx_type,
    erp_code, erp_tx_no, erp_item_name_raw, counterparty,
    quantity, memo,
    status, source_table, source_id
  ) VALUES (
    v_tx_date, v_item_id, NEW.company_code, 'production_in',
    NULL,                              -- erp_code 없음
    NEW.receipt_no,                    -- 입고번호를 tx_no로
    NEW.product_name,
    NEW.factory_name,                  -- 공장명을 counterparty에
    v_quantity,
    COALESCE('창고: ' || NEW.warehouse_name, '') || 
      CASE WHEN NEW.work_order IS NOT NULL 
           THEN ' / 작업지시: ' || NEW.work_order 
           ELSE '' END,
    'pending', 'ecount_production_receipt', NEW.id
  )
  ON CONFLICT (source_table, source_id) DO UPDATE SET
    tx_date = EXCLUDED.tx_date,
    item_id = EXCLUDED.item_id,
    erp_item_name_raw = EXCLUDED.erp_item_name_raw,
    counterparty = EXCLUDED.counterparty,
    quantity = EXCLUDED.quantity,
    memo = EXCLUDED.memo,
    status = CASE 
      WHEN orders.status = 'approved' THEN 'pending'
      ELSE orders.status 
    END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ecount_production_receipt_ai ON public.ecount_production_receipt;
CREATE TRIGGER trg_ecount_production_receipt_ai
AFTER INSERT OR UPDATE ON public.ecount_production_receipt
FOR EACH ROW
EXECUTE FUNCTION public.trg_ecount_production_receipt_to_orders();
