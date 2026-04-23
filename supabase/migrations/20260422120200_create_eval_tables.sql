-- ============================================================
-- 하루루 Phase 1 Step 1.3 — 평가 테이블 3개
-- 설계 문서: scripts/01_data_and_rag.md § 1-1, scripts/03_agent.md § 6-2
--
-- eval_golden      — 골든셋 (정답 라벨 + axis + required_tables)
-- eval_runs        — 평가 실행 집계 (7개 메트릭)
-- eval_run_details — 골든셋 per 질문별 상세
-- ============================================================

create table if not exists public.eval_golden (
  id bigserial primary key,
  question text not null,
  category text not null check (category in (
    'report', 'diagnose', 'compare', 'ops', 'meta', 'refuse'
  )),
  answer_type text not null check (answer_type in (
    'sql_only', 'rag_only', 'sql+rag', 'refuse', 'meta'
  )),
  axis text check (axis in ('erp', 'coupang', 'both', 'external', 'none')),
  required_tables text[],
  expected_answer text,
  expected_sql text,
  notes text,
  created_at timestamptz not null default now()
);

comment on table public.eval_golden is
  '하루루 골든셋. 23건으로 시작, 목표 60건. 피드백 리뷰에서 승격된 질문 추가.';

create index if not exists eval_golden_category_idx
  on public.eval_golden (category);
create index if not exists eval_golden_axis_idx
  on public.eval_golden (axis);

alter table public.eval_golden enable row level security;
drop policy if exists "eval_golden_read" on public.eval_golden;
create policy "eval_golden_read" on public.eval_golden
  for select to authenticated using (true);
grant select on public.eval_golden to authenticated;


create table if not exists public.eval_runs (
  id bigserial primary key,
  run_name text,
  config jsonb,
  intent_acc numeric,
  axis_acc numeric,
  sql_exec_success numeric,
  rag_hit_at_3 numeric,
  verifier_pass numeric,
  refuse_precision numeric,
  e2e_correctness numeric,
  notes text,
  ran_at timestamptz not null default now()
);

comment on table public.eval_runs is
  '하루루 평가 run 집계. 7개 메트릭(intent/axis/sql/rag/verifier/refuse/e2e).';

alter table public.eval_runs enable row level security;
drop policy if exists "eval_runs_read" on public.eval_runs;
create policy "eval_runs_read" on public.eval_runs
  for select to authenticated using (true);
grant select on public.eval_runs to authenticated;


create table if not exists public.eval_run_details (
  id bigserial primary key,
  run_id bigint references public.eval_runs(id) on delete cascade,
  golden_id bigint references public.eval_golden(id),
  intent_predicted text,
  axis_predicted text,
  intent_ok boolean,
  axis_ok boolean,
  sql_executed boolean,
  sql_error text,
  rag_chunks_retrieved int,
  rag_hit_at_3 boolean,
  verifier_passed boolean,
  draft_answer text,
  expected_answer text,
  e2e_judge_score numeric,
  notes text
);

comment on table public.eval_run_details is
  '하루루 평가 run 상세 — 골든셋 per 질문별 결과.';

create index if not exists eval_run_details_run_idx
  on public.eval_run_details (run_id);
create index if not exists eval_run_details_golden_idx
  on public.eval_run_details (golden_id);

alter table public.eval_run_details enable row level security;
drop policy if exists "eval_run_details_read" on public.eval_run_details;
create policy "eval_run_details_read" on public.eval_run_details
  for select to authenticated using (true);
grant select on public.eval_run_details to authenticated;
