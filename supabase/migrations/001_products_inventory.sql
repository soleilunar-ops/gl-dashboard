-- ============================================================
-- 001_products_inventory.sql
-- (주)지엘 하루온 스마트 재고 시스템 — 코어 테이블
-- 기준: gl-project-master-data-v4.xlsx (품목 마스터 144개)
-- ============================================================

-- ────────────────────────────────────────────
-- 1. 품목 마스터 (products)
-- 원본: v4 시트1 "품목 마스터" — 144행 × 18컬럼
-- ────────────────────────────────────────────
CREATE TABLE products (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  seq           INTEGER NOT NULL UNIQUE,          -- 자사 순번 (#1~#144)

  -- 기본 정보 (v4 시트1에서)
  category      TEXT NOT NULL,                    -- 구분: 파스형/160g/150g/100g/80g/30g/발난로/아이워머/아랫배/기능성/냉온찜질팩/쿨링/제습제/기타/의료기기
  product_type  TEXT NOT NULL,                    -- 유형: 제품/수입/상품
  production    TEXT NOT NULL,                    -- 생산구분: 국내생산/수입(중국)/매입상품
  manufacture_year TEXT,                          -- 제조: 24년/25년/26년
  name          TEXT NOT NULL,                    -- 품목명: 하루온팩 10매
  unit          TEXT DEFAULT '1매',               -- 단위: 1매/2매/1세트/1개/4매/1롤
  unit_cost     NUMERIC(10,2),                    -- 원가(원/매): 124.7

  -- 3코드 연동
  erp_code          TEXT,                         -- ERP 품목코드: GL250303
  erp_name          TEXT,                         -- ERP 품목명: 하루온붙이는핫팩
  coupang_sku_id    TEXT,                         -- 쿠팡 대표SKU ID: 63216406
  coupang_name      TEXT,                         -- 쿠팡 품목명
  mapping_accuracy  TEXT,                         -- 매핑 정확도: ★★★/★★☆/★☆☆
  mapping_status    TEXT,                         -- 매핑상태: ✅ 매핑/✅ 매핑(2SKU)/⬜ 매칭 미확인

  -- 메타
  is_active     BOOLEAN DEFAULT true,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_products_seq ON products(seq);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_erp_code ON products(erp_code);
CREATE INDEX idx_products_coupang_sku ON products(coupang_sku_id);

COMMENT ON TABLE products IS '품목 마스터 — 자사 144개 품목 (v4 시트1 기반)';
COMMENT ON COLUMN products.seq IS '자사 순번 (#1~#144). 일일재고현황 기준';
COMMENT ON COLUMN products.mapping_accuracy IS '쿠팡 SKU 매핑 정확도. ★★★=확실, ★★☆=높음, ★☆☆=추정';

-- ────────────────────────────────────────────
-- 2. 쿠팡 SKU 매핑 (sku_mappings)
-- 원본: v4 시트2 "SKU 매핑" — 80행
-- 자사 1 : 쿠팡 N 관계 (묶음상품 등)
-- ────────────────────────────────────────────
CREATE TABLE sku_mappings (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  coupang_sku_id  TEXT NOT NULL,                  -- 쿠팡 SKU ID: 63216406
  coupang_sku_name TEXT,                          -- 쿠팡 SKU명
  accuracy        TEXT,                           -- 정확도: ★★★/★★☆/★☆☆
  basis           TEXT,                           -- 근거: 품목+매수일치
  relation        TEXT,                           -- 관계: 1:1/대표/묶음
  erp_code        TEXT,                           -- ERP코드 (참조)
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sku_mappings_product ON sku_mappings(product_id);
CREATE INDEX idx_sku_mappings_coupang ON sku_mappings(coupang_sku_id);

COMMENT ON TABLE sku_mappings IS '자사 ↔ 쿠팡 SKU 1:N 매핑 (v4 시트2 기반). 64개 매핑, 80개 미확인';

-- ────────────────────────────────────────────
-- 3. 현재 재고 (inventory)
-- 원본: v4 시트1 "품목 마스터"의 현재고/재고금액 컬럼
-- 품목당 1행 (최신 상태)
-- ────────────────────────────────────────────
CREATE TABLE inventory (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  current_stock   INTEGER NOT NULL DEFAULT 0,     -- 현재고(매)
  carryover_stock INTEGER DEFAULT 0,              -- 이월재고(매)
  unit_cost       NUMERIC(10,2),                  -- 원가(원/매)
  inventory_value NUMERIC(15,2),                  -- 재고금액(원)
  safety_stock    INTEGER DEFAULT 0,              -- 안전재고(매) — 향후 설정
  last_checked    TEXT,                           -- 확인일: "3/2-1" 등 텍스트
  status          TEXT DEFAULT '정상',             -- 상태: 정상/품절/⚠️마이너스
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id)
);

CREATE INDEX idx_inventory_status ON inventory(status);

COMMENT ON TABLE inventory IS '현재 재고 스냅샷 — 품목당 1행. 일일재고현황 기준';

-- ────────────────────────────────────────────
-- 4. 일별 입출고 (stock_movements)
-- 원본: v4 시트3 "자사 일별 입출고" — 1,302행
-- ────────────────────────────────────────────
CREATE TABLE stock_movements (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  date            DATE NOT NULL,                  -- 날짜: 2026-03-03
  movement_type   TEXT NOT NULL,                  -- 입출고: 입고/출고/재고조정
  quantity        INTEGER NOT NULL,               -- 수량(매)
  unit_cost       NUMERIC(10,2),                  -- 원가(원/매)
  amount          NUMERIC(15,2),                  -- 금액(원가기준) = 수량×원가

  -- ERP 연동 (향후)
  erp_date        DATE,                           -- ERP 전산일자 (실제일자와 다를 수 있음)
  erp_ref         TEXT,                           -- ERP 전표번호

  -- 메타
  source          TEXT DEFAULT 'manual',          -- 데이터 소스: manual/erp/csv_upload
  confirmed       BOOLEAN DEFAULT false,          -- 실무자 확인 여부
  confirmed_by    UUID,                           -- 확인한 사용자
  confirmed_at    TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_movements_product_date ON stock_movements(product_id, date);
CREATE INDEX idx_movements_type ON stock_movements(movement_type);
CREATE INDEX idx_movements_date ON stock_movements(date);

COMMENT ON TABLE stock_movements IS '일별 입출고 이력 (v4 시트3 기반). 자사 창고 기준';
COMMENT ON COLUMN stock_movements.erp_date IS 'ERP 전산일자. 실제일자(date)와 불일치 가능';

-- ────────────────────────────────────────────
-- 5. 품목별 월간 요약 (product_monthly_summary)
-- 원본: v4 시트7 "품목별 요약" — 144행
-- ────────────────────────────────────────────
CREATE TABLE product_monthly_summary (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  year_month      TEXT NOT NULL,                  -- 기준월: "2026-03"
  carryover       INTEGER DEFAULT 0,              -- 이월재고
  inbound         INTEGER DEFAULT 0,              -- 월 입고
  outbound        INTEGER DEFAULT 0,              -- 월 출고
  adjustment      INTEGER DEFAULT 0,              -- 재고조정
  closing_stock   INTEGER DEFAULT 0,              -- 기말재고
  unit_cost       NUMERIC(10,2),
  inventory_value NUMERIC(15,2),
  status          TEXT,                           -- 정상/품절/⚠️마이너스
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id, year_month)
);

CREATE INDEX idx_monthly_summary_month ON product_monthly_summary(year_month);

COMMENT ON TABLE product_monthly_summary IS '품목별 월간 요약 (v4 시트7 기반)';
