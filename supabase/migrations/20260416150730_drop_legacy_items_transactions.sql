-- 팀원이 테스트하던 구(舊) 재고 테이블 제거
-- items(120), transactions(19), inventory_snapshots(0), scheduled_transactions(0)
-- FK CASCADE로 자동 의존성 해소
DROP TABLE IF EXISTS scheduled_transactions CASCADE;
DROP TABLE IF EXISTS inventory_snapshots CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS items CASCADE;

-- 시퀀스도 함께 정리 (SEQUENCE가 테이블과 분리 존재 가능)
DROP SEQUENCE IF EXISTS items_id_seq CASCADE;
DROP SEQUENCE IF EXISTS transactions_id_seq CASCADE;
DROP SEQUENCE IF EXISTS inventory_snapshots_id_seq CASCADE;
DROP SEQUENCE IF EXISTS scheduled_transactions_id_seq CASCADE;
