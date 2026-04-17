-- ============================================================
-- 011_order_transfer_states.sql
-- 변경 이유: 주문별 송금 진행률(선금 30% + 잔금 70%)을 사용자 간 동기화 저장하기 위해 추가합니다.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.order_transfer_states (
  purchase_id UUID PRIMARY KEY REFERENCES public.erp_purchases(id) ON DELETE CASCADE,
  advance_paid BOOLEAN NOT NULL DEFAULT true,
  remaining_paid_ratio NUMERIC(6, 4) NOT NULL DEFAULT 0,
  last_transfer_quantity NUMERIC(12, 2),
  last_transfer_amount_cny NUMERIC(15, 2),
  applied_rate NUMERIC(12, 4),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_transfer_states_updated_at
  ON public.order_transfer_states(updated_at DESC);

ALTER TABLE public.order_transfer_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_transfer_states_select_all" ON public.order_transfer_states;
CREATE POLICY "order_transfer_states_select_all"
  ON public.order_transfer_states
  FOR SELECT
  USING (true);
