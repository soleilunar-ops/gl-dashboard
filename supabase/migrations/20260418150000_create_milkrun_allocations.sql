-- 변경 이유: 비용 계산기·기간별 조회가 Supabase 클라이언트(리드타임과 동일 패턴)로 저장되도록 public.allocations 계열 테이블을 정의합니다.
CREATE TABLE IF NOT EXISTS public.allocations (
  id serial PRIMARY KEY,
  order_date date NOT NULL,
  total_cost integer NOT NULL,
  total_pallets integer NOT NULL,
  center_count integer NOT NULL,
  memo text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_allocations_order_date ON public.allocations (order_date DESC);

COMMENT ON TABLE public.allocations IS '쿠팡 밀크런 배정 요약(출고일·총액 등)';

CREATE TABLE IF NOT EXISTS public.allocation_items (
  id serial PRIMARY KEY,
  allocation_id integer NOT NULL REFERENCES public.allocations (id) ON DELETE CASCADE ON UPDATE CASCADE,
  center_name text NOT NULL,
  basic_price integer NOT NULL,
  pallet_count integer NOT NULL,
  line_cost integer NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_allocation_items_allocation_id ON public.allocation_items (allocation_id);

COMMENT ON TABLE public.allocation_items IS '쿠팡 밀크런 배정 센터별 라인';

ALTER TABLE public.allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allocation_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all allocations for authenticated users" ON public.allocations;

CREATE POLICY "Allow all allocations for authenticated users" ON public.allocations FOR ALL TO authenticated USING (true)
WITH
  CHECK (true);

DROP POLICY IF EXISTS "Allow all allocation_items for authenticated users" ON public.allocation_items;

CREATE POLICY "Allow all allocation_items for authenticated users" ON public.allocation_items FOR ALL TO authenticated USING (true)
WITH
  CHECK (true);
