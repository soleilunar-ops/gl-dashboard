-- ============================================================
-- 010_orders_schema_compat.sql
-- 변경 이유: 원격 Supabase에 erp_purchases·products.erp_name이 없을 때
--            ORDERS 화면 오류(schema cache / unknown column)를 막기 위한 보강입니다.
-- 적용: Supabase 대시보드 → SQL Editor에서 전체 실행 후 1~2분 대기(API 스키마 갱신).
-- ============================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS erp_name TEXT;

-- erp_partners 없이도 동작하도록 supplier_id는 FK 없이 둡니다(005와 달리 파트너 테이블 불필요).
CREATE TABLE IF NOT EXISTS public.erp_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id),
  erp_code TEXT,
  erp_product_name TEXT,
  supplier_id UUID,
  supplier_name TEXT,
  purchase_date DATE NOT NULL,
  erp_date DATE,
  quantity INTEGER,
  unit_price NUMERIC(10, 2),
  amount NUMERIC(15, 2),
  erp_ref TEXT,
  source TEXT DEFAULT 'erp_excel',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_erp_purchases_date ON public.erp_purchases(purchase_date);
CREATE INDEX IF NOT EXISTS idx_erp_purchases_supplier ON public.erp_purchases(supplier_id);

COMMENT ON TABLE public.erp_purchases IS 'ERP 구매현황(ORDERS). 005 미적용 프로젝트용 최소 스키마';

ALTER TABLE public.erp_purchases ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'erp_excel';

-- anon 클라이언트 조회용(쓰기는 서비스 롤 API 권장).
ALTER TABLE public.erp_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "erp_purchases_select_all" ON public.erp_purchases;
CREATE POLICY "erp_purchases_select_all" ON public.erp_purchases FOR SELECT USING (true);
