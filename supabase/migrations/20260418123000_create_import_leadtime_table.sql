-- 변경 이유: 수입 리드타임 건 추가 시 Supabase에 저장되도록 import_leadtime 테이블 및 RLS를 정의합니다.
CREATE TABLE IF NOT EXISTS public.import_leadtime (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text NOT NULL,
  product_name text NOT NULL,
  erp_code text NULL,
  bl_number text NULL,
  vessel_name text NULL,
  sea_days integer NOT NULL DEFAULT 2,
  customs_days integer NOT NULL DEFAULT 2,
  step1_actual date NULL,
  step1_expected date NULL,
  step2_actual date NULL,
  step3_actual date NULL,
  step3_expected date NULL,
  step4_expected date NULL,
  step4_actual date NULL,
  step5_expected date NULL,
  step5_actual date NULL,
  current_step integer NOT NULL DEFAULT 0,
  is_approved boolean NOT NULL DEFAULT false,
  tracking_status text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_import_leadtime_created ON public.import_leadtime (created_at DESC);

COMMENT ON TABLE public.import_leadtime IS '수입 리드타임(BL·단계별 일정)';

ALTER TABLE public.import_leadtime ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.import_leadtime;

CREATE POLICY "Allow all for authenticated users" ON public.import_leadtime FOR ALL TO authenticated USING (true)
WITH
  CHECK (true);
