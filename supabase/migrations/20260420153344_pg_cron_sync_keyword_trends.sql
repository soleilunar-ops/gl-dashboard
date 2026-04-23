-- ============================================================
-- pg_cron + pg_net \uc2a4\ucf00\uc904\ub7ec
-- \ub9e4\uc77c \ub124\uc774\ubc84 \ub370\uc774\ud130\ub7a9 \ub3d9\uae30\ud654 Edge Function \ud638\ucd9c
-- ============================================================

-- 1) \ud5ec\ud37c \ud568\uc218: vault \uc5d0\uc11c secret \uc77d\uc5b4 Edge Function \ud638\ucd9c
CREATE OR REPLACE FUNCTION public.trigger_sync_keyword_trends(
  p_days_back int DEFAULT 30,
  p_season    text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, net
AS $$
DECLARE
  v_service_key text;
  v_request_id  bigint;
  v_body        jsonb;
BEGIN
  -- vault\uc5d0 \uc800\uc7a5\ub41c service_role key \uc77d\uae30
  SELECT decrypted_secret INTO v_service_key
  FROM vault.decrypted_secrets
  WHERE name = 'sync_keyword_trends_auth'
  LIMIT 1;

  IF v_service_key IS NULL THEN
    RAISE EXCEPTION 'Vault secret "sync_keyword_trends_auth" \uc5c6\uc74c. README Step 3+ \ucc38\uc870.';
  END IF;

  -- body \uad6c\uc131
  IF p_season IS NOT NULL THEN
    v_body := jsonb_build_object('season', p_season);
  ELSE
    v_body := jsonb_build_object('days_back', p_days_back);
  END IF;

  -- Edge Function \ud638\ucd9c (\ube44\ub3d9\uae30)
  SELECT net.http_post(
    url     := 'https://sbyglmzogaiwbwfjhrmo.supabase.co/functions/v1/sync-keyword-trends',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body              := v_body,
    timeout_milliseconds := 60000
  ) INTO v_request_id;

  RETURN format('OK: request_id=%s, body=%s', v_request_id, v_body::text);
END;
$$;

COMMENT ON FUNCTION public.trigger_sync_keyword_trends IS 
  'pg_cron\uc6a9 Edge Function \ud638\ucd9c \ud5ec\ud37c. vault\uc5d0 sync_keyword_trends_auth \uc800\uc7a5 \ud544\uc694.';


-- 2) \uae30\uc874 \uc7a1 \uc815\ub9ac (idempotent \ubcf4\uc7a5)
DO $$
BEGIN
  PERFORM cron.unschedule('sync-keyword-trends-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('sync-keyword-trends-weekly-full');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;


-- 3) \ub370\uc77c\ub9ac \uc7a1: \ub9e4\uc77c UTC 21:00 = KST 06:00
--    \ucd5c\uadfc 30\uc77c \uc7ac\uc218\uc9d1 (\uc815\uaddc\ud654 \uc77c\uad00\uc131 \uc720\uc9c0)
SELECT cron.schedule(
  'sync-keyword-trends-daily',
  '0 21 * * *',
  $cmd$ SELECT public.trigger_sync_keyword_trends(30); $cmd$
);

-- 4) \uc704\ud074\ub9ac \uc7a1: \ub9e4\uc8fc \uc6d4\uc694\uc77c UTC 20:00 = KST 05:00
--    \ud604\uc7ac \uc9c4\ud589 \uc911\uc778 \uc2dc\uc98c \uc804\uccb4 \uc7ac\uc218\uc9d1 (\ucd5c\uc885 \uc815\uaddc\ud654)
SELECT cron.schedule(
  'sync-keyword-trends-weekly-full',
  '0 20 * * 1',
  $cmd$
    SELECT public.trigger_sync_keyword_trends(
      p_season => (SELECT season FROM public.fn_current_season() WHERE status IN ('active', 'closed') LIMIT 1)
    );
  $cmd$
);


-- 5) \uacb0\uacfc \ud655\uc778\uc6a9 \ubdf0
CREATE OR REPLACE VIEW public.v_cron_job_status AS
SELECT 
  j.jobid,
  j.jobname,
  j.schedule,
  j.active,
  jr.status     AS last_status,
  jr.start_time AS last_run,
  jr.return_message AS last_message
FROM cron.job j
LEFT JOIN LATERAL (
  SELECT * FROM cron.job_run_details 
  WHERE jobid = j.jobid 
  ORDER BY start_time DESC 
  LIMIT 1
) jr ON TRUE
WHERE j.jobname LIKE 'sync-keyword-trends%'
ORDER BY j.jobname;

COMMENT ON VIEW public.v_cron_job_status IS '\ub3d9\uae30\ud654 \uc7a1 \uc2a4\ucf00\uc904 \ubc0f \ub9c8\uc9c0\ub9c9 \uc2e4\ud589 \uc0c1\ud0dc \ud655\uc778\uc6a9.';;
