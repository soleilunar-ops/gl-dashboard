-- ============================================================
-- 007_shipping_import.sql
-- 수입/물류 참조 테이블
-- 기준: v4 미반영 데이터 (FOB해상비용, 컨테이너정보, 2026년수입)
-- 상태: 선적 보류 중이나 테이블은 미리 생성
-- ============================================================

-- ────────────────────────────────────────────
-- 1. 수입 발주 (중국 수입)
-- ────────────────────────────────────────────
CREATE TABLE import_orders (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id      UUID REFERENCES products(id),
  supplier_name   TEXT,                           -- 중국 공장명
  po_number       TEXT,                           -- 발주번호 (PI)
  incoterms       TEXT DEFAULT 'FOB',             -- FOB/CIF/EXW

  -- 수량 & 금액
  quantity        INTEGER,                        -- 주문수량
  unit_price_cny  NUMERIC(10,4),                  -- 단가(CNY)
  unit_price_krw  NUMERIC(10,2),                  -- 단가(KRW)
  exchange_rate   NUMERIC(10,2),                  -- 적용환율
  total_cny       NUMERIC(15,2),
  total_krw       NUMERIC(15,2),

  -- 물류 비용
  ocean_freight   NUMERIC(12,2),                  -- 해상운임(KRW)
  customs_duty    NUMERIC(12,2),                  -- 관세
  vat_import      NUMERIC(12,2),                  -- 수입 부가세
  logistics_cost  NUMERIC(12,2),                  -- 국내 물류비
  total_landed_cost NUMERIC(15,2),                -- 총 도착원가

  -- 일정
  order_date      DATE,                           -- 발주일
  etd             DATE,                           -- 출항 예정일
  eta             DATE,                           -- 입항 예정일
  customs_date    DATE,                           -- 통관일
  warehouse_date  DATE,                           -- 자사 입고일
  coupang_ship_date DATE,                         -- 쿠팡 발송일

  -- 상태
  status          TEXT DEFAULT 'draft',           -- draft/ordered/shipped/arrived/customs/warehoused/completed

  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_import_orders_status ON import_orders(status);
CREATE INDEX idx_import_orders_product ON import_orders(product_id);

COMMENT ON TABLE import_orders IS '중국 수입 발주. 입항→통관→재포장→쿠팡 발송 단계별 날짜 기록';

-- ────────────────────────────────────────────
-- 2. 해운사 견적 (참조)
-- 원본: FOB해상비용_견적.xlsx — 4개 해운사
-- ────────────────────────────────────────────
CREATE TABLE shipping_quotes (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  carrier_name    TEXT NOT NULL,                   -- 해운사명
  route           TEXT,                           -- 항로: 상해-인천
  container_type  TEXT,                           -- 20FT/40FT

  ocean_freight_usd NUMERIC(10,2),
  baf_usd         NUMERIC(10,2),                  -- BAF
  caf_usd         NUMERIC(10,2),                  -- CAF
  ecr_usd         NUMERIC(10,2),                  -- ECR/CIC
  total_usd       NUMERIC(10,2),
  exchange_rate   NUMERIC(10,2),
  total_krw       NUMERIC(12,2),

  valid_from      DATE,
  valid_to        DATE,
  created_at      TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE shipping_quotes IS '해운사 견적 참조. 4개 해운사 비교용';

-- ────────────────────────────────────────────
-- 3. 컨테이너 적재 정보 (참조)
-- 원본: 컨테이너_정보.xlsx
-- ────────────────────────────────────────────
CREATE TABLE container_specs (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_category TEXT,                           -- 제품군: 붙이는/불가마/박일병/군인핫팩 등
  container_type  TEXT,                           -- 20FT/40FT
  pallets_count   INTEGER,                        -- 파레트 수
  units_per_pallet_import INTEGER,                -- 수입 시 1파레트 적재량
  units_per_pallet_coupang INTEGER,               -- 쿠팡 출고 시 1파레트 적재량
  unit_weight_g   INTEGER,                        -- 제품 무게(g)
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE container_specs IS '컨테이너 적재 정보. 수입/쿠팡 출고 시 적재량 참조';
