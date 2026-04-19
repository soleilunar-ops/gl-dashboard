-- Restored from Supabase schema_migrations (version 20260417154202)
-- Original migration name: create_orders_approval_views

-- 승인 대기 목록
CREATE OR REPLACE VIEW v_orders_pending AS
SELECT
  o.id AS order_id,
  o.tx_date,
  o.tx_type,
  CASE o.tx_type
    WHEN 'purchase'        THEN '구매'
    WHEN 'sale'            THEN '판매'
    WHEN 'return_sale'     THEN '판매반품'
    WHEN 'return_purchase' THEN '구매반품'
  END AS tx_type_label,
  CASE o.tx_type
    WHEN 'purchase'        THEN '입고'
    WHEN 'sale'            THEN '출고'
    WHEN 'return_sale'     THEN '입고'
    WHEN 'return_purchase' THEN '출고'
  END AS stock_direction,
  o.item_id,
  im.item_name_norm AS item_name,
  im.category,
  o.erp_item_name_raw,
  o.counterparty,
  o.is_internal,
  o.quantity,
  o.unit_price,
  o.supply_amount,
  o.total_amount,
  o.erp_system,
  o.erp_tx_no,
  o.memo,
  o.crawled_at,
  o.created_at
FROM orders o
LEFT JOIN item_master im ON im.item_id = o.item_id
WHERE o.status = 'pending'
ORDER BY o.tx_date DESC, o.id DESC;

COMMENT ON VIEW v_orders_pending IS '승인 대기 orders 목록. 대시보드 [승인대기] 탭에서 사용.';

-- 승인 완료 목록
CREATE OR REPLACE VIEW v_orders_approved AS
SELECT
  o.id AS order_id,
  o.tx_date,
  o.tx_type,
  CASE o.tx_type
    WHEN 'purchase'        THEN '구매'
    WHEN 'sale'            THEN '판매'
    WHEN 'return_sale'     THEN '판매반품'
    WHEN 'return_purchase' THEN '구매반품'
  END AS tx_type_label,
  o.item_id,
  im.item_name_norm AS item_name,
  o.counterparty,
  o.is_internal,
  o.quantity,
  o.total_amount,
  o.erp_system,
  o.approved_by,
  o.approved_at,
  sm.id AS stock_movement_id,
  sm.quantity_delta,
  sm.running_stock
FROM orders o
LEFT JOIN item_master im ON im.item_id = o.item_id
LEFT JOIN stock_movement sm ON sm.source_table = 'orders' AND sm.source_id = o.id
WHERE o.status = 'approved'
ORDER BY o.approved_at DESC;

COMMENT ON VIEW v_orders_approved IS '승인 완료 orders 목록 (stock_movement 연결 정보 포함).';
