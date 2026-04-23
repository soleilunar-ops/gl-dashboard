-- ============================================================
-- 쿠팡 SKU 상세 모달의 AI 재고 분석 텍스트 저장 (리포트·이력용)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.coupang_sku_ai_analysis_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  sku_id TEXT NOT NULL,
  center_label TEXT NOT NULL,
  center_query TEXT NULL,
  sku_display_name TEXT NULL,
  gl_erp_code TEXT NULL,
  item_id INTEGER NULL,
  base_op_date DATE NOT NULL,
  period_start DATE NULL,
  period_end DATE NULL,
  title TEXT NOT NULL DEFAULT '재고 현황 분석',
  body TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_coupang_sku_ai_analysis_user_created
  ON public.coupang_sku_ai_analysis_snapshots (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_coupang_sku_ai_analysis_sku_center
  ON public.coupang_sku_ai_analysis_snapshots (sku_id, center_label);

COMMENT ON TABLE public.coupang_sku_ai_analysis_snapshots IS '쿠팡 센터 SKU 모달 AI 재고 분석 저장본 — 리포트/감사 추적용.';
COMMENT ON COLUMN public.coupang_sku_ai_analysis_snapshots.center_query IS 'inventory_operation 조회에 쓰인 center 값(null이면 센터 미지정 행).';
COMMENT ON COLUMN public.coupang_sku_ai_analysis_snapshots.base_op_date IS '표에서 선택된 행의 기준일(op_date).';
COMMENT ON COLUMN public.coupang_sku_ai_analysis_snapshots.period_start IS '차트 시리즈 첫 일자(있을 때).';
COMMENT ON COLUMN public.coupang_sku_ai_analysis_snapshots.period_end IS '차트 시리즈 마지막 일자(있을 때).';

ALTER TABLE public.coupang_sku_ai_analysis_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coupang_sku_ai_analysis_select_own"
  ON public.coupang_sku_ai_analysis_snapshots;

DROP POLICY IF EXISTS "coupang_sku_ai_analysis_insert_own"
  ON public.coupang_sku_ai_analysis_snapshots;

CREATE POLICY "coupang_sku_ai_analysis_select_own"
  ON public.coupang_sku_ai_analysis_snapshots
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "coupang_sku_ai_analysis_insert_own"
  ON public.coupang_sku_ai_analysis_snapshots
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
