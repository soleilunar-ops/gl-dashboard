-- ============================================================
-- 하루루 Phase 1 Step 1.1 — RAG 저장 테이블 3개
-- 설계 문서: scripts/01_data_and_rag.md § 3-2
--
-- rag_glossary  — 마스터 용어집 (sku·item·keyword·station·trigger·season·internal)
-- rag_analysis  — LLM이 이미 생성한 분석문 (hotpack_llm_reports 등)
-- rag_events    — 합성 카드 (Phase 1은 weekly_summary만)
--
-- 공통: HNSW 인덱스, JSONB scope GIN, RLS read-only(authenticated)
-- 전제: vector extension 0.8.0 이미 설치됨
-- ============================================================

-- ------------------------------------------------------------
-- rag_glossary
-- ------------------------------------------------------------
create table if not exists public.rag_glossary (
  id bigserial primary key,
  kind text not null check (kind in (
    'sku', 'item', 'keyword', 'station',
    'trigger_rule', 'season', 'internal_entity'
  )),
  key text not null,
  content text not null,
  scope jsonb not null default '{}'::jsonb,
  embedding vector(1536),
  embed_model text default 'text-embedding-3-small',
  source_table text not null,
  source_pk jsonb not null,
  token_count int,
  updated_at timestamptz not null default now(),
  unique (kind, key)
);

comment on table public.rag_glossary is
  '하루루 RAG — 마스터 용어집. row 1개 = 1 chunk. kind별로 item/sku/keyword 등 분류.';
comment on column public.rag_glossary.scope is
  '{category, is_active, channel_variant, axis, ...} 메타 필터용 JSONB';
comment on column public.rag_glossary.source_pk is
  '원본 PK를 jsonb로 저장 (예: {"item_id": 42}). 재백필 시 upsert 키로 사용';

create index if not exists rag_glossary_hnsw
  on public.rag_glossary using hnsw (embedding vector_cosine_ops);
create index if not exists rag_glossary_kind_idx
  on public.rag_glossary (kind);
create index if not exists rag_glossary_scope_gin
  on public.rag_glossary using gin (scope);

alter table public.rag_glossary enable row level security;

drop policy if exists "rag_glossary_read" on public.rag_glossary;
create policy "rag_glossary_read" on public.rag_glossary
  for select to authenticated using (true);

grant select on public.rag_glossary to authenticated;


-- ------------------------------------------------------------
-- rag_analysis
-- ------------------------------------------------------------
create table if not exists public.rag_analysis (
  id bigserial primary key,
  source_table text not null,
  source_pk jsonb not null,
  scope jsonb not null default '{}'::jsonb,
  title text,
  content text not null,
  embedding vector(1536),
  embed_model text default 'text-embedding-3-small',
  token_count int,
  chunk_index int not null default 0,
  chunk_total int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_table, source_pk, chunk_index)
);

comment on table public.rag_analysis is
  '하루루 RAG — 기존 LLM 생성물 (hotpack_llm_reports / hotpack_day_analysis / coupang_sku_ai_analysis_snapshots). Phase 1은 단일 chunk.';

create index if not exists rag_analysis_hnsw
  on public.rag_analysis using hnsw (embedding vector_cosine_ops);
create index if not exists rag_analysis_scope_gin
  on public.rag_analysis using gin (scope);
create index if not exists rag_analysis_src_created_idx
  on public.rag_analysis (source_table, created_at desc);

alter table public.rag_analysis enable row level security;

drop policy if exists "rag_analysis_read" on public.rag_analysis;
create policy "rag_analysis_read" on public.rag_analysis
  for select to authenticated using (true);

grant select on public.rag_analysis to authenticated;


-- ------------------------------------------------------------
-- rag_events
-- 변경 이유: unique 제약에 표현식(coalesce)을 직접 넣을 수 없어
-- PostgreSQL은 unique constraint 대신 unique index로 처리한다.
-- ------------------------------------------------------------
create table if not exists public.rag_events (
  id bigserial primary key,
  event_type text not null check (event_type in (
    'weekly_summary'
    -- Phase 2 예정: stockout, weather_extreme, keyword_spike,
    --              noncompliance, competitor_snapshot, import_delay
  )),
  event_date date not null,
  sku_id text,
  item_id bigint,
  scope jsonb not null default '{}'::jsonb,
  content text not null,
  metrics jsonb,
  embedding vector(1536),
  embed_model text default 'text-embedding-3-small',
  token_count int,
  generated_by text,
  generated_at timestamptz not null default now()
);

comment on table public.rag_events is
  '하루루 RAG — 결정적 템플릿으로 생성된 합성 카드. Phase 1은 weekly_summary 카테고리별 카드만.';
comment on column public.rag_events.metrics is
  '원본 수치 JSON (Verifier가 답변 속 숫자와 매칭할 때 사용)';

-- unique index: (event_type, event_date, sku_id or '', scope->>category or '')
create unique index if not exists rag_events_uniq_key
  on public.rag_events (
    event_type,
    event_date,
    coalesce(sku_id, ''),
    coalesce((scope ->> 'category'), '')
  );

create index if not exists rag_events_hnsw
  on public.rag_events using hnsw (embedding vector_cosine_ops);
create index if not exists rag_events_type_date_idx
  on public.rag_events (event_type, event_date desc);
create index if not exists rag_events_sku_date_idx
  on public.rag_events (sku_id, event_date desc) where sku_id is not null;
create index if not exists rag_events_scope_gin
  on public.rag_events using gin (scope);

alter table public.rag_events enable row level security;

drop policy if exists "rag_events_read" on public.rag_events;
create policy "rag_events_read" on public.rag_events
  for select to authenticated using (true);

grant select on public.rag_events to authenticated;
