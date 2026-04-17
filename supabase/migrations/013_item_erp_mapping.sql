-- 변경 이유: ERP 구매현황 동기화 시 기업별 ERP(예: 지엘팜 gl_farm)에 해당하는 품목 매핑만 사용하기 위한 테이블입니다.
CREATE TABLE IF NOT EXISTS public.item_erp_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  erp_code TEXT NOT NULL,
  erp_system TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_item_erp_mapping_code_system UNIQUE (erp_code, erp_system)
);

CREATE INDEX IF NOT EXISTS idx_item_erp_mapping_system_code
  ON public.item_erp_mapping (erp_system, erp_code);

COMMENT ON TABLE public.item_erp_mapping IS 'ERP 품목코드 ↔ 자사 products.id. erp_system으로 기업/ERP 구분 (예: gl_farm=지엘팜)';
COMMENT ON COLUMN public.item_erp_mapping.erp_system IS '매핑 구분 키 (예: gl_farm, gl, hnb)';

ALTER TABLE public.item_erp_mapping ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "item_erp_mapping_select_all" ON public.item_erp_mapping;
CREATE POLICY "item_erp_mapping_select_all" ON public.item_erp_mapping FOR SELECT USING (true);
