-- ============================================================
-- 하루루 Phase 1 Step 1.10 — 초기 백필 실행 (일회성)
-- 설계 문서: scripts/02_pipeline.md § 7 (E) · (F)
--
-- 1. 마스터 용어집 백필 (rag_glossary)
-- 2. 기존 LLM 리포트 백필 (rag_analysis)
-- 3. 과거 주간 카드 루프 (rag_events, 25시즌 시작 ~ current_date)
--
-- 실행 후 embedding은 NULL 상태로 채워짐 → rag-embed-missing cron이
-- 10분마다 OpenAI 임베딩을 채움.
-- ============================================================

select * from public.backfill_rag_glossary_all();
select * from public.backfill_rag_analysis_all();

-- 과거 주간 카드 루프 — 2025-10-06(월) ~ current_date 매 월요일
do $$
declare
  d date := '2025-10-06'::date;
begin
  while d <= current_date loop
    perform public.build_weekly_rag_events(d);
    d := d + 7;
  end loop;
end $$;

-- 검증 — 임베딩 누락 row 카운트
select * from public.count_missing_embeddings();
