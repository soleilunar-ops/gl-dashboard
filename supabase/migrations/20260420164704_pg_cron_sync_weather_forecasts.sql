-- ============================================================
-- 단기/중기 예보 자동 동기화 (Vault: sync_weather_asos_auth 재사용)
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_sync_weather_short()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, vault, net
AS $$
DECLARE
  v_service_key text;
  v_request_id  bigint;
BEGIN
  SELECT decrypted_secret INTO v_service_key
  FROM vault.decrypted_secrets WHERE name = 'sync_weather_asos_auth' LIMIT 1;
  IF v_service_key IS NULL THEN
    RAISE EXCEPTION 'Vault secret "sync_weather_asos_auth" missing';
  END IF;
  SELECT net.http_post(
    url     := 'https://sbyglmzogaiwbwfjhrmo.supabase.co/functions/v1/sync-weather-short',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer '||v_service_key
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) INTO v_request_id;
  RETURN format('OK: request_id=%s', v_request_id);
END;
$$;

COMMENT ON FUNCTION public.trigger_sync_weather_short IS 
  'pg_cron용 단기예보 동기화 헬퍼.';


CREATE OR REPLACE FUNCTION public.trigger_sync_weather_mid()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, vault, net
AS $$
DECLARE
  v_service_key text;
  v_request_id  bigint;
BEGIN
  SELECT decrypted_secret INTO v_service_key
  FROM vault.decrypted_secrets WHERE name = 'sync_weather_asos_auth' LIMIT 1;
  IF v_service_key IS NULL THEN
    RAISE EXCEPTION 'Vault secret "sync_weather_asos_auth" missing';
  END IF;
  SELECT net.http_post(
    url     := 'https://sbyglmzogaiwbwfjhrmo.supabase.co/functions/v1/sync-weather-mid',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer '||v_service_key
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) INTO v_request_id;
  RETURN format('OK: request_id=%s', v_request_id);
END;
$$;

COMMENT ON FUNCTION public.trigger_sync_weather_mid IS 
  'pg_cron용 중기기온예보 동기화 헬퍼.';


-- 기존 제거 (idempotent)
DO $$ BEGIN PERFORM cron.unschedule('sync-weather-short-daily'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('sync-weather-mid-daily');   EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 단기: 하루 2회 (05시/17시 발표 반영)
-- 05:30 KST = UTC 20:30 (전날)
-- 17:30 KST = UTC 08:30 (당일)
SELECT cron.schedule(
  'sync-weather-short-daily',
  '30 22 * * *',   -- UTC 22:30 = KST 07:30 (05시 발표 확실히 반영)
  $cmd$ SELECT public.trigger_sync_weather_short(); $cmd$
);

-- 중기: 매일 KST 08:00 (06시 발표 반영)
SELECT cron.schedule(
  'sync-weather-mid-daily',
  '0 23 * * *',    -- UTC 23:00 = KST 08:00
  $cmd$ SELECT public.trigger_sync_weather_mid(); $cmd$
);;
