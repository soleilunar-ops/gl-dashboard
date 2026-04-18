-- ============================================================
-- 트리거 2: item_master.base_stock_qty/base_date 갱신 → stock_movement에 base_set 기록
-- 일일재고 엑셀 업로드시 자동 반영
-- ============================================================
CREATE OR REPLACE FUNCTION trg_item_master_base_update()
RETURNS TRIGGER AS $$
BEGIN
  -- base_stock_qty 또는 base_date 변경 시에만 기록
  IF NEW.base_stock_qty IS DISTINCT FROM OLD.base_stock_qty
     OR NEW.base_date IS DISTINCT FROM OLD.base_date THEN
    INSERT INTO stock_movement (
      item_id, movement_date, movement_type,
      quantity_delta, running_stock,
      source_table, memo
    ) VALUES (
      NEW.item_id,
      COALESCE(NEW.base_date, CURRENT_DATE),
      'base_set',
      NEW.base_stock_qty - COALESCE(OLD.base_stock_qty, 0),
      NEW.base_stock_qty,
      'item_master',
      '일일재고 엑셀 업로드: base_stock_qty=' || NEW.base_stock_qty::TEXT
      || ', base_date=' || COALESCE(NEW.base_date::TEXT, 'NULL')
    );
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER before_item_master_update
BEFORE UPDATE ON item_master
FOR EACH ROW
EXECUTE FUNCTION trg_item_master_base_update();

COMMENT ON FUNCTION trg_item_master_base_update() IS 'item_master UPDATE시 base 변경이면 stock_movement에 base_set 기록.';
