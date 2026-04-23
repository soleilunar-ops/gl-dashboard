-- ============================================================
-- ASOS \uc2e4\uce21 \uc790\ub3d9 \ub3d9\uae30\ud654 \uc2a4\ucf00\uc904\ub7ec
-- \uae30\uc0c1\uccad \ud655\uc815 \uc2e4\uce21\uc740 \ub2e4\uc74c\ub0a0 \uc624\uc804\uc5d0 \uacf5\uc2dc\ub418\ubbc0\ub85c\n-- \uc5b4\uc81c\uae4c\uc9c0 \ub370\uc774\ud130\ub97c \ub9e4\uc77c \uc544\uce68 \uae08\uc5b4\uc624\ub294 \ubc29\uc2dd
-- ============================================================

-- ASOS\uc6a9 \ud5ec\ud37c \ud568\uc218
CREATE OR REPLACE FUNCTION public.trigger_sync_weather_asos(
  p_days_back int DEFAULT 7
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, net
AS $$
DECLARE
  v_service_key text;
  v_request_id  bigint;
BEGIN
  SELECT decrypted_secret INTO v_service_key
  FROM vault.decrypted_secrets
  WHERE name = 'sync_weather_asos_auth'
  LIMIT 1;

  IF v_service_key IS NULL THEN
    RAISE EXCEPTION 'Vault secret "sync_weather_asos_auth" \uc5c6\uc74c';
  END IF;

  SELECT net.http_post(
    url     := 'https://sbyglmzogaiwbwfjhrmo.supabase.co/functions/v1/sync-weather-asos',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body    := jsonb_build_object('days_back', p_days_back),
    timeout_milliseconds := 60000
  ) INTO v_request_id;

  RETURN format('OK: request_id=%s, days_back=%s', v_request_id, p_days_back);
END;
$$;

COMMENT ON FUNCTION public.trigger_sync_weather_asos IS 
  'pg_cron\uc6a9 ASOS \uc2e4\uce21 \ub3d9\uae30\ud654 \ud638\ucd9c \ud5ec\ud37c. Vault: sync_weather_asos_auth \ud544\uc694.';

-- \uae30\uc874 \uc7a1 \uc81c\uac70 (idempotent)
DO $$ BEGIN
  PERFORM cron.unschedule('sync-weather-asos-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- \ub9e4\uc77c UTC 22:00 = KST 07:00 (\uae30\uc0c1\uccad \uc2e4\uce21 \uacf5\uc2dc \uc774\ud6c4)
-- \ucd5c\uadfc 7\uc77c \ub370\uc774\ud130 \uc7ac\ub3d9\uae30\ud654 (\ud63c\uc2e0 \uc9c0\uc5f0 \ub370\uc774\ud130 \ubcf4\uc815 \ud3ec\ud568)
SELECT cron.schedule(
  'sync-weather-asos-daily',
  '0 22 * * *',
  $cmd$ SELECT public.trigger_sync_weather_asos(7); $cmd$
);

-- \uae30\uc874 v_cron_job_status \ubdf0\uc5d0 ASOS \uc7a1\ub3c4 \ud3ec\ud568\ub418\ub3c4\ub85d \ud328\ud134 \uc5c5\ub370\uc774\ud2b8
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
WHERE j.jobname LIKE 'sync-%'
ORDER BY j.jobname;;
