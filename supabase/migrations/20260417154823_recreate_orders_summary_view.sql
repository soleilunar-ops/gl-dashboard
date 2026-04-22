DROP VIEW IF EXISTS v_orders_summary;

CREATE VIEW v_orders_summary AS
SELECT
  -- 전체 카운트
  COUNT(*) AS total_count,
  COUNT(*) FILTER (WHERE status = 'pending')  AS pending_count,
  COUNT(*) FILTER (WHERE status = 'approved') AS approved_count,
  COUNT(*) FILTER (WHERE status = 'rejected') AS rejected_count,
  
  -- 승인 대기 분류 (가장 중요 — 실무자 To-Do)
  COUNT(*) FILTER (WHERE status = 'pending' AND tx_type IN ('purchase','return_purchase')) AS pending_purchase,
  COUNT(*) FILTER (WHERE status = 'pending' AND tx_type IN ('sale','return_sale'))         AS pending_sale,
  COUNT(*) FILTER (WHERE status = 'pending' AND tx_type IN ('return_sale','return_purchase'))  AS pending_return,
  
  -- 오늘 업무 진행률
  COUNT(*) FILTER (WHERE status = 'approved' AND approved_at::date = CURRENT_DATE) AS approved_today,
  COUNT(*) FILTER (WHERE tx_date = CURRENT_DATE AND tx_type IN ('purchase','return_purchase')) AS today_purchase,
  COUNT(*) FILTER (WHERE tx_date = CURRENT_DATE AND tx_type IN ('sale','return_sale'))         AS today_sale,
  
  -- 이번주 (지난 7일) 거래 건수
  COUNT(*) FILTER (WHERE tx_date >= CURRENT_DATE - INTERVAL '7 days' AND tx_type IN ('purchase','return_purchase')) AS week_purchase,
  COUNT(*) FILTER (WHERE tx_date >= CURRENT_DATE - INTERVAL '7 days' AND tx_type IN ('sale','return_sale'))         AS week_sale,
  
  -- 이번주 금액 합계 (승인된 것만)
  COALESCE(SUM(total_amount) FILTER (
    WHERE status = 'approved' AND tx_type = 'sale' AND tx_date >= CURRENT_DATE - INTERVAL '7 days'
  ), 0) AS week_sale_amount,
  
  COALESCE(SUM(total_amount) FILTER (
    WHERE status = 'approved' AND tx_type = 'purchase' AND tx_date >= CURRENT_DATE - INTERVAL '7 days'
  ), 0) AS week_purchase_amount
  
FROM orders;

COMMENT ON VIEW v_orders_summary IS '대시보드 상단 KPI 카드용 요약 통계. 단일 행 반환.';;
