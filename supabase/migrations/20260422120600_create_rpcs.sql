-- ============================================================
-- 하루루 Phase 1 Step 1.7 — RPC 2개
-- 설계 문서: scripts/03_agent.md § 5-1 (safe_run_sql), § 4-4 (search_rag)
--
-- safe_run_sql  — read-only SELECT/WITH만, ecount_* 차단, LIMIT 200 강제
-- search_rag    — pgvector 검색 (p_min_sim 내부 필터 포함, v0.2)
-- ============================================================

-- ------------------------------------------------------------
-- safe_run_sql
-- 4중 가드: (1) WITH/SELECT 시작 (2) DML/DDL 키워드 차단
--           (3) ecount_* 테이블 차단 (4) LIMIT 자동 주입
-- ------------------------------------------------------------
create or replace function public.safe_run_sql(p_query text)
returns setof json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lower text := lower(p_query);
begin
  -- 1. 시작 키워드 검증
  if v_lower !~ '^\s*(with|select)\s' then
    raise exception 'only SELECT/WITH allowed';
  end if;

  -- 2. DML/DDL 키워드 차단
  if v_lower ~ '\s(insert|update|delete|truncate|drop|alter|grant|revoke|create)\s' then
    raise exception 'DML/DDL blocked';
  end if;

  -- 3. ecount_* 크롤링 원본 차단 (하루루는 orders만 사용)
  if v_lower ~ '\secount_(sales|purchase|stock_ledger|production_receipt|production_outsource)(\s|_excel|,|$)' then
    raise exception 'ecount_* tables are not usable by agent. Use orders instead.';
  end if;

  -- 4. LIMIT 자동 주입
  if v_lower !~ '\slimit\s' then
    p_query := p_query || ' limit 200';
  end if;

  return query execute 'select row_to_json(t) from (' || p_query || ') t';
end $$;

revoke all on function public.safe_run_sql(text) from public;
grant execute on function public.safe_run_sql(text) to authenticated;

comment on function public.safe_run_sql(text) is
  '하루루 read-only SQL 실행 — SELECT/WITH만 허용, ecount_* 차단, LIMIT 200 자동 주입';


-- ------------------------------------------------------------
-- search_rag — pgvector 검색 (v0.2: p_min_sim 내부 필터)
-- ------------------------------------------------------------
create or replace function public.search_rag(
  p_query_embedding vector(1536),
  p_tables text[],
  p_scope_filter jsonb default '{}'::jsonb,
  p_top_k int default 6,
  p_min_sim numeric default 0.70
)
returns table (
  id bigint,
  source_table text,
  content text,
  scope jsonb,
  metrics jsonb,
  similarity numeric
) language sql stable
security definer
set search_path = public, extensions, pg_temp
as $$
  with all_hits as (
    (
      select a.id, 'rag_analysis'::text as source_table, a.content, a.scope,
             null::jsonb as metrics,
             (1 - (a.embedding <=> p_query_embedding))::numeric as similarity
      from rag_analysis a
      where 'rag_analysis' = any(p_tables)
        and a.embedding is not null
        and (p_scope_filter = '{}'::jsonb or a.scope @> p_scope_filter)
      order by a.embedding <=> p_query_embedding
      limit p_top_k
    )
    union all
    (
      select e.id, 'rag_events'::text, e.content, e.scope, e.metrics,
             (1 - (e.embedding <=> p_query_embedding))::numeric
      from rag_events e
      where 'rag_events' = any(p_tables)
        and e.embedding is not null
        and (p_scope_filter = '{}'::jsonb or e.scope @> p_scope_filter)
      order by e.embedding <=> p_query_embedding
      limit p_top_k
    )
    union all
    (
      select g.id, 'rag_glossary'::text, g.content, g.scope, null::jsonb,
             (1 - (g.embedding <=> p_query_embedding))::numeric
      from rag_glossary g
      where 'rag_glossary' = any(p_tables)
        and g.embedding is not null
      order by g.embedding <=> p_query_embedding
      limit p_top_k
    )
  )
  select id, source_table, content, scope, metrics, similarity
  from all_hits
  where similarity >= p_min_sim
  order by similarity desc
  limit p_top_k;
$$;

revoke all on function public.search_rag(vector, text[], jsonb, int, numeric) from public;
grant execute on function public.search_rag(vector, text[], jsonb, int, numeric) to authenticated;

comment on function public.search_rag(vector, text[], jsonb, int, numeric) is
  '하루루 RAG 벡터 검색 — 3개 테이블 union, axis scope filter, min_sim 내부 필터';
