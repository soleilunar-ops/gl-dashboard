CREATE OR REPLACE FUNCTION public.trigger_diag_kma_key()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, vault, net
AS $$
DECLARE v_key text; v_id bigint;
BEGIN
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'sync_weather_asos_auth' LIMIT 1;
  SELECT net.http_post(
    url := 'https://sbyglmzogaiwbwfjhrmo.supabase.co/functions/v1/diag-kma-mid',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) INTO v_id;
  RETURN 'id=' || v_id;
END;
$$;;
