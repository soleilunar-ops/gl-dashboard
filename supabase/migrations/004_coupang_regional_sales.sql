-- ============================================================
-- 004_coupang_regional_sales.sql
-- 쿠팡 지역별 판매 트렌드
-- 기준: v4 시트6 "지역별 판매" — 3,283행 × 9컬럼
-- 원본: Supply Analysis 지역별판매트렌드 CSV (2026.01~04, GMV>0)
-- ============================================================

CREATE TABLE coupang_regional_sales (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- 기간
  year_month        INTEGER NOT NULL,               -- 기준월: 202601~202604 (정수)

  -- 카테고리
  category_l1       TEXT,                           -- 상품카테고리
  category_l2       TEXT,                           -- 하위카테고리
  category_l3       TEXT,                           -- 세부카테고리
  brand             TEXT,                           -- 브랜드: 하루온/불가마/GL/로즈맥스/N_A/브랜드없음

  -- 지역
  province          TEXT NOT NULL,                  -- 시도: 17개 + etc
  district          TEXT,                           -- 시군구: 233개

  -- 매출
  gmv               BIGINT DEFAULT 0,               -- 매출액(GMV)
  units_sold        INTEGER DEFAULT 0,              -- 판매수량

  -- 메타
  source            TEXT DEFAULT 'supply_analysis',
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_regional_month ON coupang_regional_sales(year_month);
CREATE INDEX idx_regional_province ON coupang_regional_sales(province);
CREATE INDEX idx_regional_brand ON coupang_regional_sales(brand);

COMMENT ON TABLE coupang_regional_sales IS '쿠팡 지역별 판매 (v4 시트6). 3,283행 (GMV>0만). 시도 18개, 시군구 233개';
