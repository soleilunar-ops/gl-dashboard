-- 구매/판매현황 대시보드용 통합 뷰
-- 프론트엔드에서 필터/토글로 전환해서 사용
CREATE OR REPLACE VIEW v_orders_dashboard AS
SELECT
  o.id AS order_id,
  o.tx_date,
  
  -- 거래 구분 (영문 원본 + 한국어 라벨)
  o.tx_type,                              -- 'purchase' / 'sale' / 'return_sale' / 'return_purchase'
  CASE o.tx_type
    WHEN 'purchase'        THEN '구매'
    WHEN 'sale'            THEN '판매'
    WHEN 'return_sale'     THEN '판매반품'
    WHEN 'return_purchase' THEN '구매반품'
  END AS tx_type_label,
  
  -- 구매/판매 대분류 (필터용)
  CASE 
    WHEN o.tx_type IN ('purchase', 'return_purchase') THEN 'purchase'
    WHEN o.tx_type IN ('sale', 'return_sale')         THEN 'sale'
  END AS tx_category,                     -- 'purchase' / 'sale'
  
  CASE 
    WHEN o.tx_type IN ('purchase', 'return_purchase') THEN '구매'
    WHEN o.tx_type IN ('sale', 'return_sale')         THEN '판매'
  END AS tx_category_label,
  
  -- 반품 여부 플래그
  (o.tx_type IN ('return_sale', 'return_purchase')) AS is_return,
  
  -- 재고 이동 방향
  CASE o.tx_type
    WHEN 'purchase'        THEN '입고'
    WHEN 'sale'            THEN '출고'
    WHEN 'return_sale'     THEN '입고'
    WHEN 'return_purchase' THEN '출고'
  END AS stock_direction,
  
  -- 승인 상태 (영문 + 한국어)
  o.status,                               -- 'pending' / 'approved' / 'rejected'
  CASE o.status
    WHEN 'pending'  THEN '승인대기'
    WHEN 'approved' THEN '승인완료'
    WHEN 'rejected' THEN '거절'
  END AS status_label,
  
  -- 품목 정보
  o.item_id,
  im.seq_no,
  im.item_name_norm AS item_name,
  im.item_name_raw,
  im.category,
  im.item_type,
  o.erp_item_name_raw,
  
  -- 거래 상세
  o.counterparty,
  o.is_internal,
  o.quantity,
  o.unit_price,
  o.supply_amount,
  o.vat,
  o.total_amount,
  
  -- 시스템/이력
  o.erp_system,
  o.erp_code,
  o.erp_tx_no,
  o.memo,
  o.crawled_at,
  o.created_at,
  
  -- 승인 이력
  o.approved_by,
  o.approved_at,
  o.rejected_reason,
  
  -- 연결된 재고 이동 (승인된 건만)
  sm.id AS stock_movement_id,
  sm.quantity_delta,
  sm.running_stock AS stock_after_this_tx
  
FROM orders o
LEFT JOIN item_master im ON im.item_id = o.item_id
LEFT JOIN stock_movement sm 
  ON sm.source_table = 'orders' AND sm.source_id = o.id;

COMMENT ON VIEW v_orders_dashboard IS 
  '구매/판매현황 대시보드 통합 뷰. 프론트엔드에서 tx_category(구매/판매), status(대기/완료), is_return(반품) 등으로 필터링.';;
