-- Restored from Supabase schema_migrations (version 20260417154040)
-- Original migration name: add_approval_workflow_to_orders

-- 승인 워크플로우 관련 컬럼 추가
ALTER TABLE orders
  ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN approved_by TEXT,
  ADD COLUMN approved_at TIMESTAMPTZ,
  ADD COLUMN rejected_reason TEXT;

-- 승인 대기 건 조회 성능용 인덱스
CREATE INDEX idx_orders_status_pending
  ON orders (tx_date DESC)
  WHERE status = 'pending';

CREATE INDEX idx_orders_status
  ON orders (status);

-- 상태 변화 시 approved_at/by 자동 관리 체크
-- approved 상태면 approved_at이 반드시 있어야 함 (데이터 무결성)
ALTER TABLE orders
  ADD CONSTRAINT chk_approved_has_timestamp
  CHECK (
    (status = 'approved' AND approved_at IS NOT NULL)
    OR status != 'approved'
  );

COMMENT ON COLUMN orders.status IS '승인 상태: pending(대기)/approved(승인)/rejected(거절). approved일 때만 stock_movement 생성';
COMMENT ON COLUMN orders.approved_by IS '승인자 이름 (Phase 2에서 auth.users UUID로 전환 예정)';
COMMENT ON COLUMN orders.approved_at IS '승인 시각';
COMMENT ON COLUMN orders.rejected_reason IS '거절 사유';
