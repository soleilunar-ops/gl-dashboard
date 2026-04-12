-- ============================================================
-- 002_coupang_performance.sql
-- 쿠팡 일간 종합 성과 지표
-- 기준: v4 시트4 "쿠팡 일간성과" — 12,492행 × 28컬럼
-- 원본: Supply Analysis 일간성과지표 CSV (2025.04~2026.04)
-- ============================================================

CREATE TABLE coupang_performance (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- 날짜 & 식별
  date                DATE NOT NULL,                  -- 날짜 (원본: YYYYMMDD 정수 → DATE 변환)
  product_id_cp       BIGINT,                         -- Product ID: 8475831092
  barcode             TEXT,                           -- 바코드: R000333850010
  coupang_sku_id      BIGINT NOT NULL,                -- SKU ID: 2328921
  sku_name            TEXT,                           -- SKU 명
  vendor_item_id      BIGINT,                         -- 벤더아이템 ID: 3056062173
  vendor_item_name    TEXT,                           -- 벤더아이템명

  -- 카테고리 (쿠팡 분류 체계)
  category_l1         TEXT,                           -- 상품카테고리: Home/HPC/Beauty/CE
  category_l2         TEXT,                           -- 하위카테고리: Bath Acc. & Household Cleaning 등
  category_l3         TEXT,                           -- 세부카테고리: 보온소품/습기제거제 등 10개
  brand               TEXT,                           -- 브랜드: 하루온/박상병핫팩/불가마/GL 등 7개

  -- 매출
  gmv                 BIGINT DEFAULT 0,               -- 매출액(GMV) — 정가 기준
  units_sold          INTEGER DEFAULT 0,              -- 판매수량
  return_units        INTEGER DEFAULT 0,              -- 반품수량 (음수)
  cogs                BIGINT DEFAULT 0,               -- 매입원가(COGS)
  amv                 BIGINT DEFAULT 0,               -- AMV — 할인 후 실제 결제 (GMV-할인≈AMV)

  -- 할인
  coupon_discount     BIGINT DEFAULT 0,               -- 쿠폰 할인가 (쿠팡 추가 할인 제외)
  instant_discount    BIGINT DEFAULT 0,               -- 즉시 할인가

  -- 프로모션
  promo_gmv           BIGINT DEFAULT 0,               -- 프로모션 발생 매출액(GMV)
  promo_units         INTEGER DEFAULT 0,              -- 프로모션 발생 판매수량

  -- 성과 지표
  asp                 INTEGER DEFAULT 0,              -- 평균판매금액(ASP)
  order_count         INTEGER DEFAULT 0,              -- 주문건수
  customer_count      INTEGER DEFAULT 0,              -- 주문 고객 수
  avg_order_value     INTEGER DEFAULT 0,              -- 객단가
  conversion_rate     NUMERIC(6,2) DEFAULT 0,         -- 구매전환율(%)
  page_views          INTEGER DEFAULT 0,              -- PV

  -- 리뷰
  review_count        INTEGER DEFAULT 0,              -- 상품평 수
  avg_rating          NUMERIC(3,2) DEFAULT 0,         -- 평균 상품 평점

  -- 메타
  source              TEXT DEFAULT 'supply_analysis',
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- 복합 유니크 (같은 날짜+SKU+벤더아이템은 1행)
CREATE UNIQUE INDEX idx_cp_perf_unique
  ON coupang_performance(date, coupang_sku_id, vendor_item_id);

CREATE INDEX idx_cp_perf_date ON coupang_performance(date);
CREATE INDEX idx_cp_perf_sku ON coupang_performance(coupang_sku_id);
CREATE INDEX idx_cp_perf_category ON coupang_performance(category_l3);
CREATE INDEX idx_cp_perf_brand ON coupang_performance(brand);

COMMENT ON TABLE coupang_performance IS '쿠팡 일간 종합 성과 지표 (v4 시트4). 12,492행, 55개 SKU, 1년치';
COMMENT ON COLUMN coupang_performance.gmv IS '정가 기준 매출. AMV = GMV - 할인 (실제 결제)';
COMMENT ON COLUMN coupang_performance.date IS '원본은 YYYYMMDD 정수. INSERT 시 DATE로 변환 필요';
