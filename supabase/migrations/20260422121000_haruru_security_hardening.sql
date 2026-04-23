-- ============================================================
-- 하루루 Phase 4 — 보안 하드닝 (Advisor lint 대응)
--
-- 이슈 7건 수정:
--   · ERROR × 4: 뷰 4개가 SECURITY DEFINER로 생성 → SECURITY INVOKER 전환
--   · WARN  × 3: 함수 3개 search_path mutable → public, pg_temp 고정
--
-- 적용 후 Advisor security 하루루 관련 lint 0건 확인.
-- ============================================================

-- 뷰 4개: SECURITY INVOKER로 전환 (RLS 준수 보장)
alter view public.v_rag_health set (security_invoker = on);
alter view public.v_haruru_daily_usage set (security_invoker = on);
alter view public.v_haruru_axis_distribution set (security_invoker = on);
alter view public.v_haruru_recent_down_feedback set (security_invoker = on);

-- 함수 3개: search_path 고정
alter function public.backfill_rag_glossary_all() set search_path = public, pg_temp;
alter function public.backfill_rag_analysis_all() set search_path = public, pg_temp;
alter function public.build_weekly_rag_events(date) set search_path = public, pg_temp;
