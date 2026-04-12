-- ============================================================
-- 008_ai_rag.sql
-- AI 예측 + RAG + 알림 테이블
-- pgvector 확장 필요 (1단계에서 이미 활성화)
-- ============================================================

-- pgvector 확장 확인
CREATE EXTENSION IF NOT EXISTS vector;

-- ────────────────────────────────────────────
-- 1. 수요예측 결과 (정민 영역)
-- ────────────────────────────────────────────
CREATE TABLE forecasts (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id      UUID NOT NULL REFERENCES products(id),
  forecast_date   DATE NOT NULL,                  -- 예측 대상 날짜
  predicted_qty   INTEGER,                        -- 예측 수량
  model_name      TEXT,                           -- prophet/xgboost/ensemble
  confidence_lower INTEGER,                       -- 하한
  confidence_upper INTEGER,                       -- 상한
  confidence_level NUMERIC(3,2),                  -- 신뢰도 (0.00~1.00)

  -- 입력 변수 (어떤 데이터로 예측했는지 기록)
  input_features  JSONB,                          -- {weather: true, promotion: true, ...}
  model_version   TEXT,                           -- 모델 버전
  training_period TEXT,                           -- 학습 기간: "2024.01~2026.03"

  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_forecasts_product_date ON forecasts(product_id, forecast_date);
CREATE INDEX idx_forecasts_model ON forecasts(model_name);

COMMENT ON TABLE forecasts IS '수요예측 결과. Prophet/XGBoost 모델 출력. 정민 영역';

-- ────────────────────────────────────────────
-- 2. RAG 문서 저장소
-- ────────────────────────────────────────────
CREATE TABLE documents (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title           TEXT NOT NULL,
  doc_type        TEXT,                           -- manual/report/meeting/policy
  content         TEXT,                           -- 원문 전체
  file_path       TEXT,                           -- Supabase Storage 경로
  metadata        JSONB,                          -- 추가 메타 정보
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE document_chunks (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index     INTEGER NOT NULL,               -- 청크 순서
  content         TEXT NOT NULL,                  -- 청크 텍스트
  embedding       vector(1536),                   -- OpenAI text-embedding-3-small 벡터
  token_count     INTEGER,
  metadata        JSONB,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_chunks_document ON document_chunks(document_id);
CREATE INDEX idx_chunks_embedding ON document_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

COMMENT ON TABLE documents IS 'RAG용 문서. 매뉴얼, 보고서, 회의록, 정책 등';
COMMENT ON TABLE document_chunks IS 'RAG용 문서 청킹 + 벡터 임베딩. OpenAI 1536차원';

-- ────────────────────────────────────────────
-- 3. 트리거 RAG 알림 (PM 영역)
-- ────────────────────────────────────────────
CREATE TABLE alerts (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_type      TEXT NOT NULL,                  -- stock_low/cold_wave/review_surge/weekly_report
  severity        TEXT DEFAULT 'info',            -- critical/warning/info
  title           TEXT NOT NULL,
  message         TEXT,

  -- 관련 엔티티
  product_id      UUID REFERENCES products(id),
  related_data    JSONB,                          -- 트리거 발동 시 관련 데이터

  -- RAG 결과
  rag_query       TEXT,                           -- RAG에 보낸 질문
  rag_response    TEXT,                           -- RAG 답변
  rag_sources     JSONB,                          -- 참조한 문서 청크 ID 목록

  -- 상태
  status          TEXT DEFAULT 'pending',         -- pending/read/actioned/dismissed
  actioned_by     UUID REFERENCES auth.users(id),
  actioned_at     TIMESTAMPTZ,

  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_alerts_type ON alerts(alert_type);
CREATE INDEX idx_alerts_status ON alerts(status);
CREATE INDEX idx_alerts_created ON alerts(created_at DESC);

COMMENT ON TABLE alerts IS '트리거 RAG 알림. 재고부족→발주추천, 한파→수요예측, 리뷰급증→원인분석';

-- ────────────────────────────────────────────
-- 4. 날씨 데이터 (수요예측 입력, 향후)
-- ────────────────────────────────────────────
CREATE TABLE weather_data (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date            DATE NOT NULL,
  region          TEXT DEFAULT 'seoul',            -- 지역
  temp_min        NUMERIC(5,1),                   -- 최저기온
  temp_max        NUMERIC(5,1),                   -- 최고기온
  temp_avg        NUMERIC(5,1),                   -- 평균기온
  precipitation   NUMERIC(6,1),                   -- 강수량(mm)
  humidity        NUMERIC(5,1),                   -- 습도(%)
  wind_speed      NUMERIC(5,1),                   -- 풍속(m/s)
  weather_type    TEXT,                           -- 맑음/흐림/비/눈
  cold_wave_alert BOOLEAN DEFAULT false,          -- 한파 특보
  source          TEXT DEFAULT 'kma',             -- kma(기상청)/openweather
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(date, region)
);

CREATE INDEX idx_weather_date ON weather_data(date);

COMMENT ON TABLE weather_data IS '날씨 데이터 (수요예측 입력). 기상청 ASOS 또는 OpenWeather API';
