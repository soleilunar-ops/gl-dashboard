-- ============================================================
-- 하루루 Phase 1 Step 1.2 — 에이전트 런타임 테이블 3개
-- 설계 문서: scripts/01_data_and_rag.md § 3-3, 3-4
--
-- agent_config   — 런타임 설정 (프롬프트·임계값·고정 응답)
-- agent_sessions — 대화 세션 (user별)
-- agent_turns    — 개별 turn 로그 (질문·답변·SQL·RAG·메트릭)
-- ============================================================

-- ------------------------------------------------------------
-- agent_config
-- ------------------------------------------------------------
create table if not exists public.agent_config (
  key text primary key,
  value text not null,
  description text,
  updated_at timestamptz not null default now(),
  updated_by text
);

comment on table public.agent_config is
  '하루루 런타임 설정. 프롬프트·임계값·고정 응답 키-밸류. service_role만 수정.';

alter table public.agent_config enable row level security;
drop policy if exists "agent_config_read" on public.agent_config;
create policy "agent_config_read" on public.agent_config
  for select to authenticated using (true);
grant select on public.agent_config to authenticated;


-- ------------------------------------------------------------
-- agent_sessions — 본인 세션만 조회 가능 (RLS)
-- ------------------------------------------------------------
create table if not exists public.agent_sessions (
  session_id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  title text,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  turn_count int not null default 0
);

comment on table public.agent_sessions is
  '하루루 대화 세션. 각 사용자는 본인 세션만 select/update 가능.';

create index if not exists agent_sessions_user_idx
  on public.agent_sessions (user_id, last_active_at desc);

alter table public.agent_sessions enable row level security;
drop policy if exists "agent_sessions_own" on public.agent_sessions;
create policy "agent_sessions_own" on public.agent_sessions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
grant select, insert, update on public.agent_sessions to authenticated;


-- ------------------------------------------------------------
-- agent_turns — turn 단위 로그
-- axis 컬럼(v0.2): erp|coupang|both|external|none
-- ------------------------------------------------------------
create table if not exists public.agent_turns (
  id bigserial primary key,
  session_id uuid references public.agent_sessions(session_id) on delete cascade,
  turn_index int not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text,
  intent text,
  axis text check (axis in ('erp', 'coupang', 'both', 'external', 'none')),
  answer_type text,
  sql_used text,
  sql_result_rows int,
  rag_chunks jsonb,
  tool_calls jsonb,
  model text,
  latency_ms int,
  error text,
  feedback text check (feedback in ('up', 'down', 'none')),
  feedback_comment text,
  created_at timestamptz not null default now()
);

comment on table public.agent_turns is
  '하루루 턴별 상세 로그. axis·answer_type·sql_used·rag_chunks·latency 기록.';

create index if not exists agent_turns_session_idx
  on public.agent_turns (session_id, turn_index);
create index if not exists agent_turns_created_idx
  on public.agent_turns (created_at desc);
create index if not exists agent_turns_feedback_idx
  on public.agent_turns (feedback) where feedback in ('up', 'down');

alter table public.agent_turns enable row level security;

drop policy if exists "agent_turns_own_session" on public.agent_turns;
create policy "agent_turns_own_session" on public.agent_turns
  for all to authenticated
  using (
    session_id in (
      select session_id from public.agent_sessions where user_id = auth.uid()
    )
  )
  with check (
    session_id in (
      select session_id from public.agent_sessions where user_id = auth.uid()
    )
  );

grant select, insert, update on public.agent_turns to authenticated;
