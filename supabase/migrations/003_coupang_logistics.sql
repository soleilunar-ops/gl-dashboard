-- ============================================================
-- 003_coupang_logistics.sql
-- 쿠팡 물류 지표 (Rocket)
-- 기준: v4 시트5 "쿠팡 물류(Rocket)" — 5,813행 × 17컬럼
-- 원본: Supply Analysis 기본물류지표(Rocket) CSV (2026.01~04)
-- ============================================================

CREATE TABLE coupang_logistics (
  id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- 날짜 & 식별
  date                    DATE NOT NULL,              -- 날짜 (YYYYMMDD → DATE)
  coupang_sku_id          BIGINT NOT NULL,            -- SKU ID: 41856
  sku_name                TEXT,                       -- SKU 명
  barcode                 TEXT,                       -- 바코드: 8809078608987

  -- 카테고리
  category_l1             TEXT,                       -- 상품 카테고리: Home/HPC/CE
  category_l2             TEXT,                       -- 하위 카테고리
  category_l3             TEXT,                       -- 세부 카테고리: 보온소품 등 9개
  brand                   TEXT,                       -- 브랜드

  -- 물류센터
  center                  TEXT,                       -- 센터: FC/RC/SFJEJ2/SFODD2/SFSPA3

  -- 발주 상태
  order_status            TEXT,                       -- 발주가능상태: 발주가능/일시중단/발주불가
  order_status_detail     TEXT,                       -- 발주가능상태_세부: 정상/시즌오프/무매출/단종

  -- 수량
  inbound_qty             INTEGER DEFAULT 0,          -- 입고수량
  outbound_qty            INTEGER DEFAULT 0,          -- 출고수량
  current_stock           INTEGER DEFAULT 0,          -- 현재재고수량

  -- 금액
  purchase_cost           BIGINT DEFAULT 0,           -- 매입원가

  -- 품절
  is_stockout             BOOLEAN DEFAULT false,      -- 품절여부: YES→true, NO→false
  subcategory_stockout_rate NUMERIC(5,3) DEFAULT 0,   -- 세부카테고리 품절율

  -- 메타
  source                  TEXT DEFAULT 'supply_analysis',
  created_at              TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cp_logistics_date ON coupang_logistics(date);
CREATE INDEX idx_cp_logistics_sku ON coupang_logistics(coupang_sku_id);
CREATE INDEX idx_cp_logistics_center ON coupang_logistics(center);
CREATE INDEX idx_cp_logistics_stockout ON coupang_logistics(is_stockout) WHERE is_stockout = true;

COMMENT ON TABLE coupang_logistics IS '쿠팡 물류 지표 Rocket (v4 시트5). 5,813행, 45개 SKU, 5개 센터';
COMMENT ON COLUMN coupang_logistics.center IS 'FC=풀필먼트, RC=리젝트?, SFJEJ2=제주, SFODD2/SFSPA3=지역';
