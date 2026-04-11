# 팀원 가이드

## 환경 세팅 (최초 1회)

1. git clone https://github.com/soleilunar-ops/gl-dashboard.git
2. cd gl-dashboard
3. npm install
4. .env.local 파일 생성 (Notion 링크에서 내용 복사)
5. npm run dev → http://localhost:3000 확인

## 내 브랜치에서 코딩

1. git checkout feat/orders-슬아 (본인 브랜치)
2. git pull origin submain (매일 아침)
3. AI에게 코딩 요청
4. 브라우저에서 기능 확인
5. git add .
6. git commit -m "[슬아] feat: 주문 목록 추가"
7. git push origin feat/orders-슬아
8. GitHub에서 submain으로 PR 생성
9. PM이 오전 11시/오후 5시에 리뷰

## 내 담당 폴더

- 슬아: src/components/orders/, src/app/orders/
- 정민: src/components/analytics/forecast/, services/api/
- 나경: src/components/analytics/reviews/, cost/
- 진희: src/components/logistics/, src/app/logistics/

## pre-commit 에러 시

에러 메시지 전체 복사 → AI에게 "이 에러 고쳐줘"

- "비밀키 감지" → .env.local에 넣고 코드에서 process.env 사용
- "린트 에러" → AI가 자동 수정 제안해줌
- "금지 라이브러리" → 대체 수단 사용 또는 PM에게 승인 요청
- "규칙 동기화" → scripts/sync-rules.sh 실행

## Supabase 데이터 가져오기 (첫 코드)

\_hooks/ 폴더의 스켈레톤 파일 참고

## 웹 AI (ChatGPT, Gemini 등) 사용 시

PROJECT_RULES.md 내용을 첫 메시지에 붙여넣고 시작하세요

## 작업 로그

- AI가 작업 완료 후 자동으로 docs/logs/[본인이름].md에 기록합니다
- 자동 기록이 안 되면 AI에게 "로그 남겨줘"라고 말해주세요

## FastAPI 엔드포인트 필요 시

PM에게 직접 말해주세요. services/api/는 PM 영역입니다.
