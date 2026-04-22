
-- 자사 법인 alias 마스터 테이블
-- orders INSERT 시 counterparty를 이 테이블과 대조해서 is_internal 자동 세팅
CREATE TABLE IF NOT EXISTS internal_entities (
  entity_id     BIGSERIAL PRIMARY KEY,
  erp_system    TEXT NOT NULL CHECK (erp_system IN ('gl', 'gl_pharm', 'hnb')),
  match_type    TEXT NOT NULL CHECK (match_type IN ('exact', 'contains', 'regex')),
  pattern       TEXT NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (match_type, pattern)
);

-- 트리거 조회 성능용 인덱스 (is_active=TRUE만 조회)
CREATE INDEX idx_internal_entities_active 
  ON internal_entities (match_type, pattern) 
  WHERE is_active = TRUE;

COMMENT ON TABLE internal_entities IS 
  '자사 법인 alias 마스터. orders의 counterparty를 보고 is_internal을 자동 판정하는 트리거가 참조';
COMMENT ON COLUMN internal_entities.match_type IS 
  'exact(정확일치) / contains(부분일치) / regex(정규식)';
COMMENT ON COLUMN internal_entities.pattern IS 
  '매칭할 문자열 패턴. match_type에 따라 해석 방식 다름';
;
