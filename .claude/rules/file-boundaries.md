# 파일 경계 규칙

## PM 전용 — 팀원 수정 금지

- CLAUDE.md, PROJECT_RULES.md, .cursorrules, GEMINI.md
- supabase/ (migrations, seed, types)
- data/ (raw, processed, embeddings, scripts)
- src/lib/ (supabase/, hooks/, utils.ts, constants.ts)
- src/types/ (shared.ts)
- src/components/ui/ (shadcn/ui 컴포넌트)
- src/components/layout/ (Sidebar, Header, PageWrapper, navigation.config.ts)
- src/app/layout.tsx, src/app/page.tsx, src/app/globals.css
- src/app/auth/ (login, callback)
- src/app/api/
- services/api/ (main.py, rag/, triggers.py, keywords.py, utils/)
- .claude/, .cursor/, .github/, .husky/, scripts/, docs/

## 팀원 전용 — 해당 팀원만 수정

### 슬아

- src/components/orders/ (컴포넌트 추가/수정)
- src/components/analytics/cost/ (컴포넌트 추가/수정)
- src/app/(dashboard)/orders/ (page.tsx — 컴포넌트 import해서 배치만)
- src/app/(dashboard)/analytics/cost/ (page.tsx — 배치만)
- src/components/layout/nav-orders.ts (네비게이션 메뉴)

### 정민

- src/components/analytics/forecast/ (컴포넌트 추가/수정)
- src/app/(dashboard)/analytics/forecast/ (page.tsx — 배치만)
- src/components/layout/nav-forecast.ts (네비게이션 메뉴)
- services/api/routers/forecast.py (FastAPI 라우터)
- services/api/analytics/ (수요 예측 모델/인사이트 — Model A LightGBM, Model B 발주반응, OpenAI 인사이트)
- services/api/data_pipeline/ (데이터 수집/피처 빌드)
- services/api/data_sources/ (외부 API 연동 — ASOS, ECMWF)
- services/api/schemas/ (Pydantic 응답 스키마)
- services/api/run_pipeline.py (CLI 통합 진입점)
- services/api/requirements.txt (Python 의존성, 추가만 가능 — 삭제는 PM 승인)

### 나경

- src/components/analytics/reviews/ (컴포넌트 추가/수정)
- src/components/analytics/promotion/ (컴포넌트 추가/수정)
- src/app/(dashboard)/analytics/reviews/ (page.tsx — 배치만)
- src/app/(dashboard)/analytics/promotion/ (page.tsx — 배치만)
- src/components/layout/nav-reviews.ts (네비게이션 메뉴)

### 진희

- src/components/logistics/ (컴포넌트 추가/수정)
- src/app/logistics/ (page.tsx — 배치만)
- src/components/layout/nav-logistics.ts (네비게이션 메뉴)

## 공용 — 누구나 사용 가능, 수정 시 PR 필수

- src/components/shared/ (DataTable, StatCard 등)
  → 사용(import)은 자유, 소스 수정 시 PM에게 요청

## 작업 로그 (docs/logs/)

- 각 팀원은 자기 로그 파일만 수정 가능
- docs/logs/슬아.md → 슬아만
- docs/logs/정민.md → 정민만
- docs/logs/나경.md → 나경만
- docs/logs/진희.md → 진희만
- docs/logs/pm/ → PM만
- 다른 팀원의 로그 파일 수정 금지

## 경계 이탈 시 대응

- 다른 팀원의 components 폴더 파일 수정 → 금지
- 다른 팀원의 컴포넌트를 import해서 사용 → 허용
- PM 영역 수정 필요 시 → PM에게 직접 요청
- shared/ 수정 필요 시 → PM에게 요청 또는 PR
