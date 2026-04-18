-- ============================================================
-- orders_erp_tx_unique_idx(PARTIAL) → 일반 UNIQUE 제약 교체
--
-- 이유:
--   Supabase JS 클라이언트의 upsert({onConflict}) 는 PARTIAL INDEX의
--   WHERE 절을 동적으로 전달하지 못해 "there is no unique or exclusion
--   constraint matching the ON CONFLICT specification" 에러 발생.
--   크롤러는 항상 erp_tx_no / erp_tx_line_no 를 채우므로 PARTIAL 불필요.
--
-- 영향:
--   - 컬럼 조합 동일 → 기존 8,784행(gl_farm 4,465 + hnb 4,319) 영향 0
--   - NULL은 PG 기본 동작상 서로 중복 취급 안 됨 → PARTIAL WHERE 제거해도
--     기능적으로 동일 (여러 NULL 행 허용)
--   - fallback 인덱스 orders_erp_tx_nolineno_idx 는 그대로 유지
--   - 트리거/뷰 영향 없음
-- ============================================================

DROP INDEX IF EXISTS public.orders_erp_tx_unique_idx;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_erp_tx_unique
  UNIQUE (erp_system, erp_tx_no, erp_tx_line_no);

COMMENT ON CONSTRAINT orders_erp_tx_unique ON public.orders IS
  '크롤러 upsert용 일반 UNIQUE. PG 기본 NULL-not-equal 동작으로 (erp_tx_no/line_no NULL 행 다수 허용) PARTIAL 시절과 실질 동일. Supabase JS ON CONFLICT 호환 목적.';
