# 에러 대응 매뉴얼

## 빌드 실패 (npm run build)

에러 메시지를 AI에게 복사 → "이 빌드 에러 고쳐줘"

## Git 충돌

PM에게 알리기. 직접 해결하지 마세요.
PM이 submain에서 해결합니다.

## Supabase 연결 안 됨

1. .env.local 파일이 있는지 확인
2. NEXT_PUBLIC_SUPABASE_URL 값이 맞는지 확인
3. Supabase 대시보드에서 프로젝트 상태 확인

## pre-commit 에러

에러 메시지를 AI에게 복사 → "이 에러 고쳐줘"

- "비밀키 감지" → .env.local에 넣고 코드에서 process.env 사용
- "린트 에러" → AI가 자동 수정 제안해줌
- "금지 라이브러리" → 대체 수단 사용 또는 PM에게 승인 요청
- "규칙 동기화" → scripts/sync-rules.sh 실행

## 타입 에러 (빨간줄)

에러가 뜨는 줄을 AI에게 복사 → "이 타입 에러 고쳐줘"

## npm install 실패

1. node_modules 삭제: rm -rf node_modules
2. package-lock.json 삭제: rm package-lock.json
3. 다시 설치: npm install

## 페이지가 안 보임 (404)

1. src/app/[경로]/page.tsx 파일이 있는지 확인
2. 파일명이 정확히 page.tsx인지 확인
3. npm run dev 재시작
