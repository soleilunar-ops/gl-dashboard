-- ============================================================
-- \uad00\uce21\uc18c \uce74\ud0c8\ub85c\uadf8
-- \uc11c\uc6b8 \uae30\ubcf8, \ud5a5\ud6c4 \ud655\uc7a5 \uc6a9\uc774
-- ============================================================
CREATE TABLE IF NOT EXISTS public.station_catalog (
  station_code     TEXT PRIMARY KEY,
  station_kor_name TEXT NOT NULL,
  -- ASOS \uc9c0\uc810 \ubc88\ud638
  asos_stn_id      TEXT NOT NULL,
  -- \ub2e8\uae30\uc608\ubcf4 \uaca9\uc790 (\ub3d9\ub124\uc608\ubcf4)
  grid_nx          INT,
  grid_ny          INT,
  -- \uc911\uae30\uc608\ubcf4 \uc9c0\uc5ed\ucf54\ub4dc
  mid_land_reg_id  TEXT,    -- \uc721\uc0c1\uc608\ubcf4 (\uad11\uc5ed)
  mid_temp_reg_id  TEXT,    -- \uae30\uc628\uc608\ubcf4 (\uc138\ubd80 \ub3c4\uc2dc)
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.station_catalog IS 
  '\uad00\uce21\uc18c \ub9e4\ud551. ASOS/\ub2e8\uae30\uc608\ubcf4/\uc911\uae30\uc608\ubcf4 API \ucf54\ub4dc\ub97c \ud55c \uacf3\uc5d0 \ubaa8\uc544\ub454 \uce74\ud0c8\ub85c\uadf8.';

-- \uc11c\uc6b8 (\ub3c4\uc2dc \ubd84\uc11d \uae30\ubcf8)
-- ASOS 108, \uaca9\uc790 (60,127), \uc911\uae30\uc721\uc0c1 11B00000, \uc911\uae30\uae30\uc628 11B10101
INSERT INTO public.station_catalog VALUES
  ('\uc11c\uc6b8', '\uc11c\uc6b8', '108', 60, 127, '11B00000', '11B10101', TRUE, '\ubd84\uc11d \uae30\ubcf8 \uad00\uce21\uc18c'),
  ('\uc218\uc6d0', '\uc218\uc6d0', '119', 60, 121, '11B00000', '11B20601', FALSE, '\uacbd\uae30 \uc608\ube44'),
  ('\ub300\uc804', '\ub300\uc804', '133', 67, 100, '11C20000', '11C20401', FALSE, '\ucda9\uccad \uc608\ube44'),
  ('\uad11\uc8fc', '\uad11\uc8fc', '156', 58,  74, '11F20000', '11F20501', FALSE, '\ud638\ub0a8 \uc608\ube44'),
  ('\ubd80\uc0b0', '\ubd80\uc0b0', '159', 98,  76, '11H20000', '11H20201', FALSE, '\uc601\ub0a8 \uc608\ube44')
ON CONFLICT (station_code) DO NOTHING;;
