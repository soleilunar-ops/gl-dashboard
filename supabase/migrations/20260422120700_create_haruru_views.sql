-- ============================================================
-- 하루루 Phase 1 Step 1.8 — 운영 관측 뷰 4개
-- 설계 문서: scripts/02_pipeline.md § 6, scripts/05_rollout_and_risks.md § 3-1
--
-- v_rag_health                   — RAG 테이블별 임베딩 커버리지
-- v_haruru_daily_usage           — 일별 질문 수·👍/👎·레이턴시
-- v_haruru_axis_distribution     — 주간 axis × intent 분포
-- v_haruru_recent_down_feedback  — 최근 👎 피드백 50건 (질문과 함께)
-- ============================================================

create or replace view public.v_rag_health as
with counts as (
  select 'rag_glossary' as t,
         count(*) as total,
         count(*) filter (where embedding is not null) as embedded,
         count(*) filter (where embedding is null) as missing,
         max(updated_at) as last_updated
  from public.rag_glossary
  union all
  select 'rag_analysis',
         count(*),
         count(*) filter (where embedding is not null),
         count(*) filter (where embedding is null),
         max(updated_at)
  from public.rag_analysis
  union all
  select 'rag_events',
         count(*),
         count(*) filter (where embedding is not null),
         count(*) filter (where embedding is null),
         max(generated_at)
  from public.rag_events
)
select t as target_table, total, embedded, missing,
       case when total > 0 then round(embedded::numeric / total * 100, 1) else 0 end as coverage_pct,
       last_updated
from counts;

grant select on public.v_rag_health to authenticated;


create or replace view public.v_haruru_daily_usage as
select
  date(t.created_at) as day,
  count(*) filter (where t.role = 'user') as questions,
  count(distinct t.session_id) as sessions,
  count(distinct s.user_id) as active_users,
  count(*) filter (where t.feedback = 'up') as thumbs_up,
  count(*) filter (where t.feedback = 'down') as thumbs_down,
  round(avg(t.latency_ms) filter (where t.role = 'assistant'))::int as avg_latency_ms,
  count(*) filter (where t.error is not null) as error_count
from public.agent_turns t
left join public.agent_sessions s on s.session_id = t.session_id
group by date(t.created_at)
order by day desc;

grant select on public.v_haruru_daily_usage to authenticated;


create or replace view public.v_haruru_axis_distribution as
select
  date_trunc('week', created_at)::date as week,
  intent,
  axis,
  count(*) as cnt
from public.agent_turns
where role = 'assistant' and intent is not null
group by 1, 2, 3
order by 1 desc, 2, 3;

grant select on public.v_haruru_axis_distribution to authenticated;


create or replace view public.v_haruru_recent_down_feedback as
select
  t.id, t.created_at, t.content as answer,
  t.axis, t.feedback_comment, t.sql_used,
  (select content from public.agent_turns u
    where u.session_id = t.session_id
      and u.turn_index = t.turn_index - 1
      and u.role = 'user') as question
from public.agent_turns t
where t.feedback = 'down'
order by t.created_at desc
limit 50;

grant select on public.v_haruru_recent_down_feedback to authenticated;
