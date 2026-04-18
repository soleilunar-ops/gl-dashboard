-- ============================================================
-- L0-2. item_erp_mapping (144 × 3 ERP = ~432 row)
-- ============================================================
CREATE TABLE item_erp_mapping (
  id              BIGSERIAL PRIMARY KEY,
  item_id         BIGINT NOT NULL REFERENCES item_master(item_id) ON DELETE CASCADE,
  erp_system      TEXT NOT NULL CHECK (erp_system IN ('gl','gl_farm','hnb')),
  erp_code        TEXT,  -- NULL 허용: NONE(해당 ERP에 없음) 케이스
  erp_item_name   TEXT,
  erp_spec        TEXT,
  confidence      TEXT NOT NULL CHECK (confidence IN ('HIGH','MEDIUM','LOW','CHECK','NONE')),
  mapping_status  TEXT NOT NULL CHECK (mapping_status IN ('ai_suggested','verified','rejected')) DEFAULT 'ai_suggested',
  verified_by     TEXT,
  verified_at     TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (item_id, erp_system)
);

-- 크롤러가 (erp_system, erp_code)로 item_id 조회 시 필수 인덱스
CREATE INDEX idx_item_erp_code ON item_erp_mapping(erp_system, erp_code);
CREATE INDEX idx_item_erp_status ON item_erp_mapping(mapping_status);
CREATE INDEX idx_item_erp_item ON item_erp_mapping(item_id);

COMMENT ON TABLE item_erp_mapping IS '144 × 3 ERP(gl/gl_farm/hnb) 매핑. 크롤러가 erp_code로 item_id 역매칭.';
COMMENT ON COLUMN item_erp_mapping.erp_code IS 'NULL이면 해당 ERP에서 취급 안 함(NONE). 조사했으나 없음 vs 미조사 구분용.';
COMMENT ON COLUMN item_erp_mapping.confidence IS 'AI 제안 신뢰도: HIGH/MEDIUM/LOW/CHECK/NONE.';
COMMENT ON COLUMN item_erp_mapping.mapping_status IS '2단계 검증: ai_suggested → verified/rejected.';
