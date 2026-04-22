
-- 1. v_item_full 뷰 삭제 (confidence 참조 중)
DROP VIEW IF EXISTS public.v_item_full;

-- 2. item_erp_mapping에서 4개 컬럼 삭제
ALTER TABLE public.item_erp_mapping 
  DROP COLUMN IF EXISTS confidence,
  DROP COLUMN IF EXISTS mapping_status,
  DROP COLUMN IF EXISTS verified_by,
  DROP COLUMN IF EXISTS verified_at;

-- 3. v_item_full 뷰 재생성 (confidence 제외)
CREATE VIEW public.v_item_full AS
SELECT 
  im.item_id,
  im.seq_no,
  im.item_name_raw,
  im.item_name_norm,
  im.category,
  im.item_type,
  im.manufacture_year,
  im.channel_variant,
  iem_gl.erp_code AS gl_erp_code,
  iem_gp.erp_code AS gl_pharm_erp_code,
  iem_hnb.erp_code AS hnb_erp_code,
  ( SELECT jsonb_agg(jsonb_build_object(
      'sku_id', icm.coupang_sku_id, 
      'bundle_ratio', icm.bundle_ratio, 
      'channel_variant', icm.channel_variant,
      'status', icm.mapping_status
    ))
    FROM item_coupang_mapping icm
    WHERE icm.item_id = im.item_id) AS coupang_mappings,
  COALESCE(sm.running_stock, im.base_stock_qty) AS current_stock,
  im.base_stock_qty,
  im.base_date,
  im.is_active
FROM item_master im
  LEFT JOIN item_erp_mapping iem_gl ON iem_gl.item_id = im.item_id AND iem_gl.erp_system = 'gl'
  LEFT JOIN item_erp_mapping iem_gp ON iem_gp.item_id = im.item_id AND iem_gp.erp_system = 'gl_pharm'
  LEFT JOIN item_erp_mapping iem_hnb ON iem_hnb.item_id = im.item_id AND iem_hnb.erp_system = 'hnb'
  LEFT JOIN LATERAL (
    SELECT sm.running_stock
    FROM stock_movement sm
    WHERE sm.item_id = im.item_id
    ORDER BY sm.movement_date DESC, sm.id DESC
    LIMIT 1
  ) sm ON true
ORDER BY im.seq_no;
;
