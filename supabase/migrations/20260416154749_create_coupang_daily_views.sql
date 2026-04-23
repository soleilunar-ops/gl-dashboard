-- ============================================================
-- 쿠팡 채널 데이터를 item_master 기준 + 일별로 깔끔하게 조회하는 View
-- (stock_movement와 별개, GL 창고 재고와 혼동 X)
-- ============================================================

-- 1) 쿠팡 일별 판매 (item_master 단위 집계)
CREATE OR REPLACE VIEW v_coupang_daily_sales AS
SELECT
  im.item_id,
  im.seq_no,
  im.item_name_raw,
  im.category,
  dp.sale_date,
  -- 쿠팡 박스 판매량
  SUM(dp.units_sold) AS boxes_sold,
  -- GL 기준 낱개 매수 환산 (bundle_ratio 활용)
  SUM(dp.units_sold * icm.bundle_ratio) AS pieces_sold_gl_unit,
  -- 반품
  SUM(dp.return_units) AS boxes_returned,
  SUM(dp.return_units * icm.bundle_ratio) AS pieces_returned_gl_unit,
  -- 금액
  SUM(dp.gmv) AS gmv,
  SUM(dp.promo_gmv) AS promo_gmv,
  -- 연결된 SKU 개수
  COUNT(DISTINCT dp.sku_id) AS sku_count,
  STRING_AGG(DISTINCT dp.sku_id, ', ') AS sku_ids
FROM daily_performance dp
JOIN item_coupang_mapping icm ON icm.coupang_sku_id = dp.sku_id
JOIN item_master im ON im.item_id = icm.item_id
GROUP BY im.item_id, im.seq_no, im.item_name_raw, im.category, dp.sale_date;

COMMENT ON VIEW v_coupang_daily_sales IS
'쿠팡 일별 판매를 item_master(144) 단위로 집계. pieces_sold_gl_unit = 박스×bundle_ratio로 GL 낱개 매수 환산. GL 창고 재고(v_current_stock)와 혼동 금지 - 이건 쿠팡FC→소비자 판매 지표.';

-- 2) 쿠팡 일별 재고 상태 (item_master 단위 집계)
CREATE OR REPLACE VIEW v_coupang_daily_stock AS
SELECT
  im.item_id,
  im.seq_no,
  im.item_name_raw,
  im.category,
  io.op_date,
  -- 쿠팡 FC 재고 (박스 단위)
  SUM(io.current_stock) AS total_boxes_in_coupang_fc,
  -- GL 기준 낱개 환산
  SUM(io.current_stock * icm.bundle_ratio) AS total_pieces_gl_unit,
  SUM(io.inbound_qty) AS boxes_inbound,
  SUM(io.outbound_qty) AS boxes_outbound,
  -- 품절 상태
  BOOL_OR(io.is_stockout) AS any_sku_stockout,
  COUNT(*) FILTER (WHERE io.is_stockout) AS stockout_sku_count,
  COUNT(DISTINCT io.sku_id) AS sku_count,
  STRING_AGG(DISTINCT io.sku_id, ', ') AS sku_ids
FROM inventory_operation io
JOIN item_coupang_mapping icm ON icm.coupang_sku_id = io.sku_id
JOIN item_master im ON im.item_id = icm.item_id
GROUP BY im.item_id, im.seq_no, im.item_name_raw, im.category, io.op_date;

COMMENT ON VIEW v_coupang_daily_stock IS
'쿠팡 FC의 일별 재고 상태를 item_master 단위로 집계. 이는 GL이 쿠팡에 이미 B2B 납품 후의 재고 - GL 창고 재고와 별개.';

-- 3) item_master 144개 전체 + 쿠팡 현황 통합 조회 (대시보드용)
CREATE OR REPLACE VIEW v_item_with_coupang_status AS
SELECT
  im.item_id,
  im.seq_no,
  im.item_name_raw,
  im.category,
  im.item_type,
  im.manufacture_year,
  im.base_stock_qty,
  im.base_date,
  -- GL 창고 현재 재고 (v_current_stock과 같은 로직)
  COALESCE(sm.running_stock, im.base_stock_qty) AS gl_warehouse_stock,
  -- 쿠팡 FC 최신 재고 상태 (어제 or 오늘 기준)
  cs.total_boxes_in_coupang_fc AS coupang_fc_boxes,
  cs.total_pieces_gl_unit AS coupang_fc_pieces_gl_unit,
  cs.op_date AS coupang_last_updated,
  -- 쿠팡 판매 지표 (최근 30일)
  recent.boxes_sold_30d,
  recent.pieces_sold_30d_gl_unit,
  recent.gmv_30d,
  -- 연결 상태
  CASE WHEN icm_count.cnt > 0 THEN TRUE ELSE FALSE END AS has_coupang_mapping,
  icm_count.cnt AS coupang_sku_count
FROM item_master im
-- GL 창고 재고
LEFT JOIN LATERAL (
  SELECT running_stock FROM stock_movement
  WHERE item_id = im.item_id
  ORDER BY movement_date DESC, id DESC LIMIT 1
) sm ON TRUE
-- 쿠팡 FC 최신 재고
LEFT JOIN LATERAL (
  SELECT op_date, total_boxes_in_coupang_fc, total_pieces_gl_unit
  FROM v_coupang_daily_stock
  WHERE item_id = im.item_id
  ORDER BY op_date DESC LIMIT 1
) cs ON TRUE
-- 최근 30일 판매
LEFT JOIN LATERAL (
  SELECT
    SUM(boxes_sold) AS boxes_sold_30d,
    SUM(pieces_sold_gl_unit) AS pieces_sold_30d_gl_unit,
    SUM(gmv) AS gmv_30d
  FROM v_coupang_daily_sales
  WHERE item_id = im.item_id
    AND sale_date >= CURRENT_DATE - INTERVAL '30 days'
) recent ON TRUE
-- 쿠팡 SKU 연결 개수
LEFT JOIN (
  SELECT item_id, COUNT(*) AS cnt
  FROM item_coupang_mapping GROUP BY item_id
) icm_count ON icm_count.item_id = im.item_id
ORDER BY im.seq_no;

COMMENT ON VIEW v_item_with_coupang_status IS
'144개 품목의 GL창고 재고 + 쿠팡FC 재고 + 쿠팡 최근30일 판매를 한 행으로. 두 재고는 물리적으로 다른 위치에 있으므로 합산 금지.';
