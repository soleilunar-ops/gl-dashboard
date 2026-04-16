# (주)지엘 하루온 스마트 재고 시스템 — 프로젝트 규칙

## 1. 프로젝트 개요

하루온(핫팩) 제품의 스마트 재고 관리 대시보드.
쿠팡 판매 데이터, 이카운트 ERP, 기상 데이터를 통합하여
수요 예측, 재고 최적화, 리뷰 분석을 제공한다.

## 2. 기술 스택

- 프론트엔드: Next.js 15 + Tailwind v4 + shadcn/ui
- 백엔드: FastAPI (AI/RAG 전용)
- DB/BaaS: Supabase (PostgreSQL + pgvector + Auth)
- 배포: Vercel (프론트) + Railway (백엔드)

### 절대 금지 라이브러리

- ORM: Prisma, Drizzle, TypeORM (→ Supabase 직접 호출)
- UI: MUI, Ant Design, Chakra, Mantine (→ shadcn/ui만 사용)
- HTTP: axios (→ fetch 또는 supabase-js)
- 상태 관리: Redux (→ React useState/useContext)

### PM 승인 필요 라이브러리

- 데이터 캐싱: react-query, SWR (현재는 \_hooks/ 패턴)
- 경량 상태 관리: Zustand, Jotai (현재는 useState/useContext)
- 승인 절차: 팀 채널에 사유 공유 → PM 확인 → 이 파일 수정 → 커밋

## 3. 폴더 규칙 + 팀원별 영역

### PM 전용 (수정 금지)

CLAUDE.md, PROJECT_RULES.md, supabase/, data/, src/lib/, src/types/,
src/components/ui/, src/components/layout/ (본체), src/app/layout.tsx,
src/app/page.tsx, src/app/auth/, .claude/, .cursor/, .github/, scripts/, docs/

### 팀원 영역

- 슬아: src/components/orders/, src/components/analytics/cost/,
  src/app/orders/, src/app/analytics/cost/, src/components/layout/nav-orders.ts
- 정민: src/components/analytics/forecast/, services/api/routers/forecast.py,
  services/api/models/, src/app/analytics/forecast/, src/components/layout/nav-forecast.ts
- 나경: src/components/analytics/reviews/, src/components/analytics/promotion/,
  src/app/analytics/reviews/, src/app/analytics/promotion/, src/components/layout/nav-reviews.ts
- 진희: src/components/logistics/, src/app/logistics/,
  src/components/layout/nav-logistics.ts

### 공용 (수정 시 PR 필수)

src/components/shared/ — 사용(import)은 자유, 소스 수정 시 PM에게 요청

## 4. 코딩 컨벤션

- 변수명: camelCase (TypeScript), snake_case (Python)
- 컴포넌트: PascalCase (OrderListTable.tsx)
- 상수: UPPER_SNAKE_CASE
- import 순서: React → 외부 → @/components/shared → @/components/[영역] → @/lib
- Supabase: 단순 CRUD는 프론트 직접, AI/RAG만 FastAPI
- UI 컴포넌트는 반드시 src/components/ui/에서 import
- 한국어 주석 사용

### 데이터 가져오기 패턴

- 컴포넌트 데이터는 같은 폴더 \_hooks/에서 가져온다
- \_hooks/에서 supabase.from().select() 사용
- FastAPI 호출은 forecast 전용 (FASTAPI_URL + '/endpoint')

## 5. 커밋 규칙

형식: [담당자] type: 설명
예시: [슬아] feat: 주문 목록 테이블 구현
type: feat, fix, chore, docs, style, refactor

## 6. DB 규칙

- 팀원이 Supabase 대시보드에서 컬럼 추가 가능 (자율)
- 추가 후 팀 채널에 알림 필수
- types.ts는 자동 재생성됨 (submain push 시)

## 7. 컴포넌트 원칙

1. 컴포넌트는 같은 폴더의 \_hooks/에서 데이터를 가져온다
2. 다른 팀원 폴더의 훅은 import하지 않는다
3. 컴포넌트를 옮길 때는 같은 폴더의 훅도 함께 옮긴다
4. 다른 팀원의 컴포넌트를 import해서 사용하는 것은 허용
5. 다른 팀원의 컴포넌트 소스를 수정하는 것은 금지
6. 교차 테이블 로직은 Supabase RPC 사용
7. 새 컴포넌트 전 shared/ 폴더 먼저 확인. 없으면 PM에게 요청

## 8. Git 브랜치 전략

main ← submain에서만 PR (배포용)
submain ← 팀원 브랜치에서 PR (통합 테스트)
team/슬아
team/정민
team/나경
team/진희
team/지호
PR 병합: 하루 2회 (오전 11시, 오후 5시)

## 9. 작업 로그 규칙

- 작업 시작 전: 자기 로그 파일을 읽고 이전 작업 파악
- 작업 완료 후: 자기 로그 파일에 기록
- 로그 파일 위치: docs/logs/[팀원명].md
- AI에게 "로그 남겨줘"라고 말하면 자동 기록
- 다른 팀원의 로그 파일 수정 금지
