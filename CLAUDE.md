# (주)지엘 하루온 스마트 재고 시스템

## 기술 스택

Next.js 15 + Tailwind v4 + shadcn/ui + Supabase + FastAPI(AI전용)
절대 금지: Prisma, Drizzle, TypeORM, MUI, Ant Design, Chakra, Mantine, Redux, axios
PM 승인 필요: react-query, SWR, Zustand, Jotai (사용 전 PM에게 확인)

## 명령어

- npm run dev → 개발 서버 (localhost:3000)
- npm run build → 프로덕션 빌드
- npx tsc --noEmit → 타입 체크

## 절대 규칙

1. 새 파일은 반드시 src/components/[본인영역]/ 안에 생성
2. 다른 팀원의 components 폴더 파일 수정 금지
3. page.tsx는 컴포넌트를 import해서 배치만
4. Supabase 타입은 @/lib/supabase/types에서 import
5. .env 값을 코드에 직접 넣지 않기
6. 커밋 전 브라우저에서 기능 동작 확인
7. 새 컴포넌트 전 shared/ 폴더 먼저 확인. 없으면 PM에게 요청

## 팀원 영역

- 슬아: components/orders/, components/analytics/promotion/
- 정민: components/analytics/forecast/, services/api/(routers/forecast.py, models/)
- 나경: components/analytics/reviews/, components/analytics/cost/
- 진희: components/logistics/

## 상세 규칙

- 코딩 스타일: @.claude/rules/code-style.md
- 파일 경계: @.claude/rules/file-boundaries.md
- 작업 로그: @.claude/rules/work-log.md
- Supabase 패턴: @.claude/skills/supabase-crud/SKILL.md
