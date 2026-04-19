-- Restored from Supabase schema_migrations (version 20260417155525)
-- Original migration name: enable_rls_with_authenticated_policy_all_tables

-- ========================================
-- 1단계: RLS 비활성화된 7개 테이블에 RLS 활성화
-- ========================================
ALTER TABLE orders                ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movement        ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_master           ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_erp_mapping      ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_coupang_mapping  ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_entities     ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbound_staging       ENABLE ROW LEVEL SECURITY;

-- ========================================
-- 2단계: 모든 테이블에 authenticated 전체 허용 정책 추가
-- (팀원이 competitor_products에 쓴 동일 패턴)
-- ========================================

-- 이번 세션에 RLS 켠 7개
CREATE POLICY "Allow all for authenticated users" ON orders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON stock_movement
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON item_master
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON item_erp_mapping
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON item_coupang_mapping
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON internal_entities
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON inbound_staging
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 기존에 RLS는 켜있었으나 정책이 없던 8개
CREATE POLICY "Allow all for authenticated users" ON daily_performance
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON data_sync_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON inventory_operation
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON noncompliant_delivery
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON regional_sales
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON safety_stock_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON sku_master
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON weather_unified
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
