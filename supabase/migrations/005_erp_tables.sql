-- ============================================================
-- 005_erp_tables.sql
-- ERP(이카운트) 연동 테이블
-- 기준: 19단계 분석 — ERP 판매조회 8,452건, 구매현황 549건, 생산입고 1,166건
-- 상태: 엑셀 일부 수신. API 연동 확인 중 → 컬럼은 이카운트 표준 기반
-- ============================================================

-- ────────────────────────────────────────────
-- 1. ERP 거래처 마스터
-- ────────────────────────────────────────────
CREATE TABLE erp_partners (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  partner_code    TEXT,                           -- 이카운트 거래처코드
  partner_name    TEXT NOT NULL,                  -- 거래처명: 쿠팡(주), 모바일워커, 씨피엘비(주)
  partner_type    TEXT,                           -- 유형: 매출/매입/양쪽
  channel         TEXT,                           -- 채널 분류: 쿠팡/자사/도매/기타
  is_coupang      BOOLEAN DEFAULT false,          -- 쿠팡 관련 거래처 여부 (미결#1)
  contact         TEXT,
  notes           TEXT,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_erp_partners_name ON erp_partners(partner_name);
CREATE INDEX idx_erp_partners_channel ON erp_partners(channel);

COMMENT ON TABLE erp_partners IS 'ERP 거래처 마스터. 쿠팡(주)/모바일워커/씨피엘비(주) 관계 확인 필요 (미결#1)';

-- ────────────────────────────────────────────
-- 2. ERP 판매 전표 (매출)
-- 원본: 이카운트 판매조회 8,452건 (2024.01~2026.04)
-- 쿠팡(주) 2,314건 발견 → 전체 매출 274.3억 중 쿠팡 ~96억(35%)
-- ────────────────────────────────────────────
CREATE TABLE erp_sales (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id      UUID REFERENCES products(id),     -- 자사 품목 FK (매핑 가능 시)
  erp_code        TEXT,                             -- ERP 품목코드: GL250303
  erp_product_name TEXT,                            -- ERP 품목명
  partner_id      UUID REFERENCES erp_partners(id), -- 거래처 FK
  partner_name    TEXT,                             -- 거래처명 (비정규화, 조회 편의)

  sale_date       DATE NOT NULL,                    -- 판매일 (실제)
  erp_date        DATE,                             -- ERP 전산일자
  quantity        INTEGER,                          -- 수량
  unit_price      NUMERIC(10,2),                    -- 단가
  amount          NUMERIC(15,2),                    -- 금액
  vat             NUMERIC(12,2),                    -- 부가세
  total_amount    NUMERIC(15,2),                    -- 합계금액

  erp_ref         TEXT,                             -- ERP 전표번호
  source          TEXT DEFAULT 'erp_excel',         -- erp_excel/erp_api
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_erp_sales_date ON erp_sales(sale_date);
CREATE INDEX idx_erp_sales_partner ON erp_sales(partner_id);
CREATE INDEX idx_erp_sales_product ON erp_sales(product_id);
CREATE INDEX idx_erp_sales_erp_code ON erp_sales(erp_code);

COMMENT ON TABLE erp_sales IS 'ERP 판매 전표. 8,452건 (2024.01~2026.04). 쿠팡 ~35% 비중';

-- ────────────────────────────────────────────
-- 3. ERP 구매 (입고)
-- 원본: 이카운트 구매현황 549건 — 214개 품목, 61개 구매처
-- ────────────────────────────────────────────
CREATE TABLE erp_purchases (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id      UUID REFERENCES products(id),
  erp_code        TEXT,
  erp_product_name TEXT,
  supplier_id     UUID REFERENCES erp_partners(id),
  supplier_name   TEXT,                             -- 구매처명

  purchase_date   DATE NOT NULL,
  erp_date        DATE,
  quantity        INTEGER,
  unit_price      NUMERIC(10,2),
  amount          NUMERIC(15,2),

  erp_ref         TEXT,
  source          TEXT DEFAULT 'erp_excel',
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_erp_purchases_date ON erp_purchases(purchase_date);
CREATE INDEX idx_erp_purchases_supplier ON erp_purchases(supplier_id);

COMMENT ON TABLE erp_purchases IS 'ERP 구매현황. 549건, 214개 품목, 61개 구매처';

-- ────────────────────────────────────────────
-- 4. ERP 생산입고
-- 원본: 이카운트 생산입고현황 1,166건 — 86개 품목, 18개 공장라인
-- ────────────────────────────────────────────
CREATE TABLE erp_production (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id      UUID REFERENCES products(id),
  erp_code        TEXT,
  erp_product_name TEXT,
  production_line TEXT,                             -- 공장라인명 (18개)

  production_date DATE NOT NULL,
  erp_date        DATE,
  quantity        INTEGER,                          -- 생산수량
  unit_cost       NUMERIC(10,2),

  erp_ref         TEXT,
  source          TEXT DEFAULT 'erp_excel',
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_erp_production_date ON erp_production(production_date);
CREATE INDEX idx_erp_production_line ON erp_production(production_line);

COMMENT ON TABLE erp_production IS 'ERP 생산입고. 1,166건, 86개 품목, 18개 공장라인. 연간 495만매';

-- ────────────────────────────────────────────
-- 5. ERP 품목코드 전체 (참조용)
-- 원본: 이카운트 품목코드 1,312개
-- 완제품 ~412개, 나머지 원자재/포장재/카톤/진열대
-- ────────────────────────────────────────────
CREATE TABLE erp_item_codes (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  erp_code        TEXT NOT NULL UNIQUE,             -- GL250303, KG44570 등
  erp_name        TEXT,                             -- ERP 품목명
  specification   TEXT,                             -- 규격: 10매, 5매 등
  item_type       TEXT,                             -- 완제품/원자재/포장재/카톤/진열대
  product_id      UUID REFERENCES products(id),     -- 자사 144개 매핑 (매핑된 것만)
  code_year       TEXT,                             -- 코드 연도: GL25=2025
  is_current      BOOLEAN DEFAULT true,             -- 현재 사용 코드 여부
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_erp_items_code ON erp_item_codes(erp_code);
CREATE INDEX idx_erp_items_product ON erp_item_codes(product_id);

COMMENT ON TABLE erp_item_codes IS 'ERP 전체 품목코드 1,312개. GL+연도2+월2+일련번호. 같은 제품에 연도별 다른 코드 존재';
