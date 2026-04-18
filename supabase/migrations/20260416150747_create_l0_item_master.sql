-- ============================================================
-- L0-1. item_master (144개 마스터재고, 모든 분석의 앵커)
-- ============================================================
CREATE TABLE item_master (
  item_id          BIGSERIAL PRIMARY KEY,
  seq_no           INTEGER NOT NULL UNIQUE,
  item_name_raw    TEXT NOT NULL,
  item_name_norm   TEXT NOT NULL,
  unit_count       INTEGER,
  unit_label       TEXT,
  category         TEXT,
  item_type        TEXT,
  manufacture_year TEXT,
  channel_variant  TEXT,
  base_cost        NUMERIC(12,2),
  base_stock_qty   INTEGER NOT NULL DEFAULT 0,
  base_date        DATE,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_item_master_name_norm ON item_master(item_name_norm);
CREATE INDEX idx_item_master_category ON item_master(category);
CREATE INDEX idx_item_master_active ON item_master(is_active) WHERE is_active = TRUE;

COMMENT ON TABLE item_master IS '일일재고현황 기준 마스터재고 144건. 3개 ERP와 쿠팡의 모든 거래/재고 분석의 앵커. base_date=2026-04-08 기준.';
COMMENT ON COLUMN item_master.base_stock_qty IS '일일재고현황 엑셀의 재고수량. stock_movement 누적의 시작점.';
COMMENT ON COLUMN item_master.base_date IS '베이스 수량의 기준일. 이후 거래만 stock_movement에 누적 (2026-04-08 고정).';
COMMENT ON COLUMN item_master.item_name_norm IS '검색/역매칭용 정규화 이름 (매수/용량/괄호 제거).';
COMMENT ON COLUMN item_master.channel_variant IS '기본/홈쇼핑용/약국용/쿠팡번들 등 채널 변종 구분.';
