-- ============================================================
-- \ub808\uac70\uc2dc \uae30\uc0c1 \ud30c\uc774\ud504\ub77c\uc778 \uc740\ud1f4
-- - daily-weather-fetch cron \uc81c\uac70
-- - weather_daily \u2192 weather_daily_legacy \ub85c \ub9ac\ub124\uc784
-- ============================================================

-- 1) \ub808\uac70\uc2dc cron \uc7a1 \uc81c\uac70
DO $$ BEGIN
  PERFORM cron.unschedule('daily-weather-fetch');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'daily-weather-fetch \uc788\uc74c \ub610\ub294 \uc81c\uac70 \uc2e4\ud328: %', SQLERRM;
END $$;

-- 2) weather_daily \ud14c\uc774\ube14 \ub9ac\ub124\uc784 (\ub370\uc774\ud130 \ubcf4\uc874, \uc0ac\uc6a9 \ucc28\ub2e8)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='weather_daily'
  ) THEN
    ALTER TABLE public.weather_daily RENAME TO weather_daily_legacy;
  END IF;
END $$;

COMMENT ON TABLE public.weather_daily_legacy IS 
  '\u26a0\ufe0f LEGACY: 2026-04-21 \uc740\ud1f4. \uc0c8\ub85c\uc6b4 \ud30c\uc774\ud504\ub77c\uc778\uc740 weather_unified \uc0ac\uc6a9. \ucc38\uc870 \uc5c6\uc73c\uba74 \ucd94\ud6c4 DROP \uac00\ub2a5.';;
