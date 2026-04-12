-- ============================================================
-- 009_rpc_views.sql
-- RPC 함수 + 자주 쓰는 뷰
-- 교차 테이블 로직은 Supabase RPC로 처리 (설계 결정 3-5)
-- ============================================================

-- ────────────────────────────────────────────
-- 1. updated_at 자동 갱신 트리거
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- products
CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- inventory
CREATE TRIGGER trg_inventory_updated_at
  BEFORE UPDATE ON inventory
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ────────────────────────────────────────────
-- 2. 재고 차감 + 출고 기록 RPC
-- 주문 처리 시 inventory 차감 + stock_movements INSERT를 한 트랜잭션으로
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION process_stock_movement(
  p_product_id UUID,
  p_movement_type TEXT,  -- '입고'/'출고'/'재고조정'
  p_quantity INTEGER,
  p_unit_cost NUMERIC DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_movement_id UUID;
  v_cost NUMERIC;
  v_current_stock INTEGER;
BEGIN
  -- 원가 가져오기
  IF p_unit_cost IS NULL THEN
    SELECT unit_cost INTO v_cost FROM inventory WHERE product_id = p_product_id;
  ELSE
    v_cost := p_unit_cost;
  END IF;

  -- stock_movements 기록
  INSERT INTO stock_movements (product_id, date, movement_type, quantity, unit_cost, amount, source)
  VALUES (
    p_product_id,
    CURRENT_DATE,
    p_movement_type,
    p_quantity,
    v_cost,
    p_quantity * COALESCE(v_cost, 0),
    'system'
  )
  RETURNING id INTO v_movement_id;

  -- inventory 갱신
  IF p_movement_type = '입고' THEN
    UPDATE inventory
    SET current_stock = current_stock + p_quantity,
        inventory_value = (current_stock + p_quantity) * COALESCE(unit_cost, 0)
    WHERE product_id = p_product_id;
  ELSIF p_movement_type = '출고' THEN
    UPDATE inventory
    SET current_stock = current_stock - p_quantity,
        inventory_value = (current_stock - p_quantity) * COALESCE(unit_cost, 0)
    WHERE product_id = p_product_id;
  ELSIF p_movement_type = '재고조정' THEN
    UPDATE inventory
    SET current_stock = current_stock + p_quantity,  -- 양수=증가, 음수=감소
        inventory_value = (current_stock + p_quantity) * COALESCE(unit_cost, 0)
    WHERE product_id = p_product_id;
  END IF;

  -- 상태 갱신
  SELECT current_stock INTO v_current_stock FROM inventory WHERE product_id = p_product_id;
  UPDATE inventory
  SET status = CASE
    WHEN v_current_stock < 0 THEN '⚠️마이너스'
    WHEN v_current_stock = 0 THEN '품절'
    ELSE '정상'
  END
  WHERE product_id = p_product_id;

  RETURN v_movement_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION process_stock_movement IS '입출고 처리 RPC. inventory 갱신 + stock_movements 기록을 한 트랜잭션으로';

-- ────────────────────────────────────────────
-- 3. 대시보드용 뷰: 재고 현황 + 품목 정보
-- ────────────────────────────────────────────
CREATE OR REPLACE VIEW v_inventory_dashboard AS
SELECT
  p.id AS product_id,
  p.seq,
  p.category,
  p.name AS product_name,
  p.product_type,
  p.production,
  p.unit,
  i.current_stock,
  i.carryover_stock,
  i.unit_cost,
  i.inventory_value,
  i.safety_stock,
  i.status,
  p.coupang_sku_id,
  p.coupang_name,
  p.erp_code,
  p.mapping_status,
  i.updated_at
FROM products p
LEFT JOIN inventory i ON p.id = i.product_id
ORDER BY p.seq;

COMMENT ON VIEW v_inventory_dashboard IS '대시보드 메인: 품목+재고 통합 뷰';

-- ────────────────────────────────────────────
-- 4. 쿠팡 성과 요약 뷰 (일별 합계)
-- ────────────────────────────────────────────
CREATE OR REPLACE VIEW v_coupang_daily_summary AS
SELECT
  date,
  SUM(gmv) AS total_gmv,
  SUM(amv) AS total_amv,
  SUM(units_sold) AS total_units,
  SUM(return_units) AS total_returns,
  SUM(promo_gmv) AS total_promo_gmv,
  AVG(conversion_rate) AS avg_conversion,
  SUM(page_views) AS total_pv,
  COUNT(DISTINCT coupang_sku_id) AS active_skus
FROM coupang_performance
GROUP BY date
ORDER BY date DESC;

COMMENT ON VIEW v_coupang_daily_summary IS '쿠팡 일별 전체 요약. GMV/AMV/판매/반품/PV';

-- ────────────────────────────────────────────
-- 5. 안전재고 부족 품목 뷰 (알림 트리거용)
-- ────────────────────────────────────────────
CREATE OR REPLACE VIEW v_low_stock_alerts AS
SELECT
  p.id AS product_id,
  p.seq,
  p.name AS product_name,
  p.category,
  i.current_stock,
  i.safety_stock,
  (i.current_stock - i.safety_stock) AS stock_gap,
  i.status
FROM products p
JOIN inventory i ON p.id = i.product_id
WHERE i.safety_stock > 0
  AND i.current_stock <= i.safety_stock
ORDER BY (i.current_stock - i.safety_stock) ASC;

COMMENT ON VIEW v_low_stock_alerts IS '안전재고 이하 품목. 재고부족 알림 트리거에 사용';

-- ────────────────────────────────────────────
-- 6. RAG 벡터 검색 함수
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION search_documents(
  query_embedding vector(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  chunk_id UUID,
  document_id UUID,
  content TEXT,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.content,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM document_chunks dc
  WHERE 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION search_documents IS 'RAG 벡터 유사도 검색. OpenAI 임베딩 1536차원, cosine similarity';

-- ────────────────────────────────────────────
-- 7. 데이터 수집 현황 테이블
-- 원본: v4 시트8 "수집현황" — 관리용
-- ────────────────────────────────────────────
CREATE TABLE data_collection_status (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source          TEXT NOT NULL,                  -- 소스: 지엘/쿠팡/ERP/외부
  data_name       TEXT NOT NULL,                  -- 데이터명
  status          TEXT NOT NULL,                  -- ✅/⏳/⬜
  purpose         TEXT,                           -- 용도
  notes           TEXT,                           -- 비고
  last_updated    TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE data_collection_status IS '데이터 수집 현황 관리 (v4 시트8 기반)';
