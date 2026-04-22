-- 주문별 서류 첨부 테이블 + Storage 버킷 — 변경 이유: 서류 팝업에서 저장 시 영구 보관
CREATE TABLE IF NOT EXISTS public.order_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_order_documents_order_id ON public.order_documents(order_id DESC);

COMMENT ON TABLE public.order_documents IS '주문 행에 연결된 서류 — 버킷 order-documents 내 storage_path';

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('order-documents', 'order-documents', false, 52428800)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.order_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY order_documents_select_own ON public.order_documents
  FOR SELECT TO authenticated USING (true);
