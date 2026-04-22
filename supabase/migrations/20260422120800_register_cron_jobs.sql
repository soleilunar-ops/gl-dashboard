-- ============================================================
-- 하루루 Phase 1 Step 1.9 — pg_cron 3개 등록
-- 설계 문서: scripts/02_pipeline.md § 5, scripts/05_rollout_and_risks.md § 3-2
--
-- rag-weekly-summary         — 매주 월 02:00, 지난주 요약 카드 생성
-- rag-embed-missing          — 10분마다 Edge Function 호출
-- haruru-daily-health-check  — 매일 09:00, 전일 에러율 점검
--
-- 전제: pg_cron 1.6.4, pg_net 0.20.0 이미 설치됨
-- Edge Function rag-embed-missing은 Phase 2에서 배포 후 자동 호출 시작
-- ============================================================

-- 기존 동일 이름 잡 정리 (재등록 안전)
do $$
declare j record;
begin
  for j in select jobname from cron.job where jobname in ('rag-weekly-summary','rag-embed-missing','haruru-daily-health-check') loop
    perform cron.unschedule(j.jobname);
  end loop;
end $$;

-- 1) 주간 요약 카드 — 매주 월 02:00 KST (UTC로는 전주 일 17:00)
--    pg_cron은 UTC 기준 스케줄. 한국 월 02:00 = UTC 일 17:00
select cron.schedule(
  'rag-weekly-summary',
  '0 17 * * 0',
  $cron$
    select public.build_weekly_rag_events(
      (date_trunc('week', current_date)::date - 7)
    );
  $cron$
);

-- 2) 임베딩 누락 처리 — 10분마다
select cron.schedule(
  'rag-embed-missing',
  '*/10 * * * *',
  $cron$
    select net.http_post(
      url := 'https://sbyglmzogaiwbwfjhrmo.functions.supabase.co/rag-embed-missing',
      headers := jsonb_build_object('content-type', 'application/json'),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $cron$
);

-- 3) 전일 건강도 집계 — 매일 09:00 KST (UTC 00:00)
select cron.schedule(
  'haruru-daily-health-check',
  '0 0 * * *',
  $cron$
  with yesterday as (
    select * from public.v_haruru_daily_usage where day = current_date - 1
  )
  insert into public.data_sync_log (table_name, status, error_message, synced_at)
  select 'haruru_agent',
    case when coalesce(error_count::float, 0) / nullif(questions, 0) > 0.1 then 'failed' else 'success' end,
    format('에러율 %s%%, 질문 %s건, down 피드백 %s건',
      round(coalesce(error_count, 0)::numeric / nullif(questions, 0) * 100, 1),
      coalesce(questions, 0), coalesce(thumbs_down, 0)),
    now()
  from yesterday;
  $cron$
);
