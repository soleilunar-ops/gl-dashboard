-- 대시보드 KPI 카드용 요약 뷰
CREATE OR REPLACE VIEW v_orders_summary AS
SELECT
  -- 전체 카운트
  COUNT(*) AS total_count,
  COUNT(*) FILTER (WHERE status = 'pending')  AS pending_count,
  COUNT(*) FILTER (WHERE status = 'approved') AS approved_count,
  COUNT(*) FILTER (WHERE status = 'rejected') AS rejected_count,
  
  -- 구매/판매 카운트 (pending만 — 승인 대기)
  COUNT(*) FILTER (WHERE status = 'pending' AND tx_type IN ('purchase','return_purchase')) AS pending_purchase,
  COUNT(*) FILTER (WHERE status = 'pending' AND tx_type IN ('sale','return_sale'))         AS pending_sale,
  
  -- 오늘 승인된 건 (업무 진행 체감용)
  COUNT(*) FILTER (WHERE status = 'approved' AND approved_at::date = CURRENT_DATE) AS approved_today,
  
  -- 오늘 거래 발생 (tx_date 기준)
  COUNT(*) FILTER (WHERE tx_date = CURRENT_DATE AND tx_type IN ('purchase','return_purchase')) AS today_purchase,
  COUNT(*) FILTER (WHERE tx_date = CURRENT_DATE AND tx_type IN ('sale','return_sale'))         AS today_sale,
  
  -- 이번주 (지난 7일)
  COUNT(*) FILTER (WHERE tx_date >= CURRENT_DATE - INTERVAL '7 days' AND tx_type IN ('purchase','return_purchase')) AS week_purchase,
  COUNT(*) FILTER (WHERE tx_date >= CURRENT_DATE - INTERVAL '7 days' AND tx_type IN ('sale','return_sale'))         AS week_sale,
  
  -- 금액 합계 (승인된 것만)
  COALESCE(SUM(total_amount) FILTER (
    WHERE status = 'approved' AND tx_type = 'sale' AND tx_date >= CURRENT_DATE - INTERVAL '7 days'
  ), 0) AS week_sale_amount,
  
  COALESCE(SUM(total_amount) FILTER (
    WHERE status = 'approved' AND tx_type = 'purchase' AND tx_date >= CURRENT_DATE - INTERVAL '7 days'
  ), 0) AS week_purchase_amount
  
FROM orders;

COMMENT ON VIEW v_orders_summary IS '대시보드 상단 KPI 카드용 요약 통계. 단일 행 반환.';;
