-- Restored from Supabase schema_migrations (version 20260417154600)
-- Original migration name: recreate_v_stock_history_with_labels

DROP VIEW IF EXISTS v_stock_history;

CREATE VIEW v_stock_history AS
SELECT 
  sm.item_id,
  im.seq_no,
  im.item_name_raw,
  im.item_name_norm,
  im.category,
  sm.movement_date,
  sm.movement_type,
  CASE sm.movement_type
    WHEN 'purchase'        THEN '구매'
    WHEN 'sale'            THEN '판매'
    WHEN 'return_sale'     THEN '판매반품'
    WHEN 'return_purchase' THEN '구매반품'
    WHEN 'base_set'        THEN '기준설정'
    WHEN 'manual_adjust'   THEN '수동조정'
  END AS movement_type_label,
  CASE sm.movement_type
    WHEN 'purchase'        THEN '입고'
    WHEN 'sale'            THEN '출고'
    WHEN 'return_sale'     THEN '입고'
    WHEN 'return_purchase' THEN '출고'
    WHEN 'base_set'        THEN '기준설정'
    WHEN 'manual_adjust'   THEN CASE WHEN sm.quantity_delta >= 0 THEN '입고' ELSE '출고' END
  END AS stock_direction,
  sm.quantity_delta,
  sm.running_stock,
  sm.erp_system,
  sm.memo,
  sm.source_table,
  sm.source_id,
  sm.created_at
FROM stock_movement sm
JOIN item_master im ON sm.item_id = im.item_id
ORDER BY sm.item_id, sm.movement_date, sm.id;

COMMENT ON VIEW v_stock_history IS 
  '재고흐름표. movement_type(영문 원본) + movement_type_label(한국어 상세) + stock_direction(입고/출고) 제공.';
