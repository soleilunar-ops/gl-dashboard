-- ------------------------------------------------------------
-- agent_sessions — 삭제 권한 부여
-- 사용자가 홈 화면 "최근 대화" 목록에서 본인 세션을 삭제할 수 있도록.
-- RLS 정책(agent_sessions_own)은 `for all`로 이미 delete까지 커버.
-- agent_turns는 `on delete cascade`로 자동 삭제됨.
-- ------------------------------------------------------------

grant delete on public.agent_sessions to authenticated;
