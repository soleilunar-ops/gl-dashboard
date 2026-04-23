-- ============================================================
-- erp_system 값 'gl_farm' → 'gl_pharm' 전체 치환
--
-- 변경 내용:
--   1. orders / item_erp_mapping 의 CHECK 제약 DROP (값 갱신 허용)
--   2. orders / item_erp_mapping / stock_movement 데이터 UPDATE
--   3. CHECK 제약 재생성 (IN ('gl','gl_pharm','hnb'))
--   4. v_item_full 뷰 재생성 (JOIN 조건 + 컬럼 별칭 gl_pharm_*)
--   5. 테이블 COMMENT 갱신
--
-- 영향:
--   - 기존 기능: 코드에 'gl_farm' 하드코딩 없음 (진희 크롤러는 매핑 테이블 값 그대로 전달)
--   - 다른 팀원 코드: gl_farm 참조 0건 (영향 없음)
--   - 뷰 컬럼명 gl_farm_erp_code 등은 현재 사용 코드 0건이라 blast radius 0
-- ============================================================

-- Step 1: CHECK 제약 DROP
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_erp_system_check;
ALTER TABLE public.item_erp_mapping DROP CONSTRAINT IF EXISTS item_erp_mapping_erp_system_check;

-- Step 2: 데이터 UPDATE
UPDATE public.orders          SET erp_system = 'gl_pharm' WHERE erp_system = 'gl_farm';
UPDATE public.item_erp_mapping SET erp_system = 'gl_pharm' WHERE erp_system = 'gl_farm';
UPDATE public.stock_movement  SET erp_system = 'gl_pharm' WHERE erp_system = 'gl_farm';

-- Step 3: CHECK 제약 재생성
ALTER TABLE public.orders
  ADD CONSTRAINT orders_erp_system_check
  CHECK (erp_system IN ('gl','gl_pharm','hnb'));

ALTER TABLE public.item_erp_mapping
  ADD CONSTRAINT item_erp_mapping_erp_system_check
  CHECK (erp_system IN ('gl','gl_pharm','hnb'));

-- Step 4: v_item_full 뷰 재생성
DROP VIEW IF EXISTS public.v_item_full CASCADE;

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
  -- GL 매핑
  iem_gl.erp_code       AS gl_erp_code,
  iem_gl.confidence     AS gl_confidence,
  iem_gl.mapping_status AS gl_status,
  -- 지엘팜 매핑
  iem_gp.erp_code       AS gl_pharm_erp_code,
  iem_gp.confidence     AS gl_pharm_confidence,
  iem_gp.mapping_status AS gl_pharm_status,
  -- HNB 매핑
  iem_hnb.erp_code      AS hnb_erp_code,
  iem_hnb.confidence    AS hnb_confidence,
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
LEFT JOIN item_erp_mapping iem_gp  ON iem_gp.item_id  = im.item_id AND iem_gp.erp_system  = 'gl_pharm'
LEFT JOIN item_erp_mapping iem_hnb ON iem_hnb.item_id = im.item_id AND iem_hnb.erp_system = 'hnb'
LEFT JOIN LATERAL (
  SELECT running_stock FROM stock_movement
  WHERE item_id = im.item_id
  ORDER BY movement_date DESC, id DESC LIMIT 1
) sm ON TRUE
ORDER BY im.seq_no;

COMMENT ON VIEW public.v_item_full IS '144 품목의 모든 매핑(3 ERP + 쿠팡) + 현재재고 통합. AI 조회/엑셀 다운로드용.';

-- Step 5: 테이블 COMMENT 갱신
COMMENT ON TABLE public.item_erp_mapping IS '144 × 3 ERP(gl/gl_pharm/hnb) 매핑. 크롤러가 erp_code로 item_id 역매칭.';
COMMENT ON TABLE public.orders IS 'GL/지엘팜(gl_pharm)/HNB 3개 ERP의 구매/판매/반품 통합 거래. 144개 item_master에 매칭된 거래만 저장 (밖은 버림).';
