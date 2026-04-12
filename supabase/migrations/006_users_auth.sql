-- ============================================================
-- 006_users_auth.sql
-- 사용자 및 인증 테이블
-- Supabase Auth 연동 — auth.users와 1:1 매핑
-- ============================================================

CREATE TABLE users (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  name            TEXT NOT NULL,                   -- 표시 이름
  role            TEXT NOT NULL DEFAULT 'viewer',  -- admin/manager/viewer
  department      TEXT,                            -- 부서
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_users_role ON users(role);

COMMENT ON TABLE users IS '시스템 사용자. Supabase Auth와 연동. 역할: admin(PM), manager(지엘), viewer(팀원)';

-- ────────────────────────────────────────────
-- RLS 정책 (기본)
-- ────────────────────────────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 모든 인증 사용자가 자기 정보 조회 가능
CREATE POLICY "users_read_own" ON users
  FOR SELECT USING (auth.uid() = id);

-- admin만 모든 사용자 조회 가능
CREATE POLICY "users_read_all_admin" ON users
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ────────────────────────────────────────────
-- 감사 로그 (데이터 변경 이력)
-- ────────────────────────────────────────────
CREATE TABLE audit_log (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID REFERENCES auth.users(id),
  action          TEXT NOT NULL,                   -- INSERT/UPDATE/DELETE
  table_name      TEXT NOT NULL,                   -- 변경된 테이블
  record_id       UUID,                            -- 변경된 행 ID
  old_data        JSONB,                           -- 변경 전 (UPDATE/DELETE)
  new_data        JSONB,                           -- 변경 후 (INSERT/UPDATE)
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_table ON audit_log(table_name, created_at);
CREATE INDEX idx_audit_user ON audit_log(user_id);

COMMENT ON TABLE audit_log IS '데이터 변경 감사 로그. 재고/입출고 변경 시 자동 기록';
