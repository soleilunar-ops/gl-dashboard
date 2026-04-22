CREATE OR REPLACE FUNCTION public.trigger_diag_kma_with_key(p_key text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, vault, net
AS $$
DECLARE v_auth text; v_id bigint;
BEGIN
  SELECT decrypted_secret INTO v_auth FROM vault.decrypted_secrets WHERE name = 'sync_weather_asos_auth' LIMIT 1;
  SELECT net.http_post(
    url := 'https://sbyglmzogaiwbwfjhrmo.supabase.co/functions/v1/diag-kma-mid',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_auth),
    body := jsonb_build_object('test_key', p_key),
    timeout_milliseconds := 60000
  ) INTO v_id;
  RETURN 'id=' || v_id;
END;
$$;;
