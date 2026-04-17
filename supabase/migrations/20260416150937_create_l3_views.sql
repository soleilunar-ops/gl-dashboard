-- ============================================================
-- L3-1. v_current_stock — 144개 현재재고 (대시보드 메인)
-- ============================================================
CREATE VIEW v_current_stock AS
SELECT
  im.item_id,
  im.seq_no,
  im.item_name_raw,
  im.item_name_norm,
  im.category,
  im.item_type,
  im.manufacture_year,
  im.channel_variant,
  im.unit_count,
  im.unit_label,
  im.base_cost,
  im.base_stock_qty,
  im.base_date,
  COALESCE(sm.running_stock, im.base_stock_qty) AS current_stock,
  sm.movement_date AS last_movement_date,
  sm.movement_type AS last_movement_type,
  im.is_active
FROM item_master im
LEFT JOIN LATERAL (
  SELECT running_stock, movement_date, movement_type
  FROM stock_movement
  WHERE item_id = im.item_id
  ORDER BY movement_date DESC, id DESC
  LIMIT 1
) sm ON TRUE
ORDER BY im.seq_no;

COMMENT ON VIEW v_current_stock IS '144개 품목의 실시간 현재재고. 대시보드 메인 화면용. base_stock_qty + Σstock_movement 누적.';

-- ============================================================
-- L3-2. v_stock_history — 품목별 재고 변동 이력
-- ============================================================
CREATE VIEW v_stock_history AS
SELECT
  sm.item_id,
  im.seq_no,
  im.item_name_raw,
  im.category,
  sm.movement_date,
  sm.movement_type,
  sm.quantity_delta,
  sm.running_stock,
  sm.erp_system,
  sm.memo,
  sm.source_table,
  sm.source_id
FROM stock_movement sm
JOIN item_master im ON sm.item_id = im.item_id
ORDER BY sm.item_id, sm.movement_date, sm.id;

COMMENT ON VIEW v_stock_history IS '재고 변동 시계열 이력. 추이 그래프/감사용.';

-- ============================================================
-- L3-3. v_item_full — 매핑 전체 붙은 통합 조회 (AI/엑셀 다운로드용)
-- ============================================================
CREATE VIEW v_item_full AS
SELECT
  im.item_id,
  im.seq_no,
  im.item_name_raw,
  im.item_name_norm,
  im.category,
  im.item_type,
  im.manufacture_year,
  im.channel_variant,
  -- GL 매핑
  iem_gl.erp_code    AS gl_erp_code,
  iem_gl.confidence  AS gl_confidence,
  iem_gl.mapping_status AS gl_status,
  -- 지엘팜 매핑
  iem_gf.erp_code    AS gl_farm_erp_code,
  iem_gf.confidence  AS gl_farm_confidence,
  iem_gf.mapping_status AS gl_farm_status,
  -- HNB 매핑
  iem_hnb.erp_code   AS hnb_erp_code,
  iem_hnb.confidence AS hnb_confidence,
  iem_hnb.mapping_status AS hnb_status,
  -- 쿠팡 매핑 (1:N 배열)
  (
    SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
      'sku_id', coupang_sku_id,
      'bundle_ratio', bundle_ratio,
      'channel_variant', channel_variant,
      'status', mapping_status
    ))
    FROM item_coupang_mapping
    WHERE item_id = im.item_id
  ) AS coupang_mappings,
  -- 현재재고
  COALESCE(sm.running_stock, im.base_stock_qty) AS current_stock,
  im.base_stock_qty,
  im.base_date,
  im.is_active
FROM item_master im
LEFT JOIN item_erp_mapping iem_gl  ON iem_gl.item_id  = im.item_id AND iem_gl.erp_system  = 'gl'
LEFT JOIN item_erp_mapping iem_gf  ON iem_gf.item_id  = im.item_id AND iem_gf.erp_system  = 'gl_farm'
LEFT JOIN item_erp_mapping iem_hnb ON iem_hnb.item_id = im.item_id AND iem_hnb.erp_system = 'hnb'
LEFT JOIN LATERAL (
  SELECT running_stock FROM stock_movement
  WHERE item_id = im.item_id
  ORDER BY movement_date DESC, id DESC LIMIT 1
) sm ON TRUE
ORDER BY im.seq_no;

COMMENT ON VIEW v_item_full IS '144 품목의 모든 매핑(3 ERP + 쿠팡) + 현재재고 통합. AI 조회/엑셀 다운로드용.';
