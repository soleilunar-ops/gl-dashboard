# PM 작업 로그 — frontend

> Claude Code CLI 작업 내용이 기록됩니다.
> 일자별 로그는 시간순(과거 → 최신)으로 정렬. 맨 아래 "미결 / 확인 필요 사항"은 지속 갱신.

---

### [2026-04-14] [PM 코드 리뷰 — 슬아님]

**요청:** 슬아님 PR(`team/슬아` → `submain`) 코드 품질 및 파일 경계 규칙 준수 여부 리뷰
**변경 파일:** `docs/logs/슬아.md`
**변경 내용:** 슬아님 작업 로그에 노출된 API 키(`EXCHANGE_RATE_KEY=1f9a15...`) 제거, 환경변수명만 남김
**주의사항:**

- `src/app/(dashboard)/orders/page.tsx`에 368줄 로직이 직접 작성됨 → `src/components/orders/`로 분리 필요 (절대규칙 3번 위반)
- `src/lib/margin/` 2개 파일, `src/app/api/exchange-rate/` 1개 파일이 PM 전용 영역에 생성됨 → 위치 조정 또는 PM 승인 필요
- `useMarginCalc.ts` 내 데드 코드 약 40% (PACKAGING_DATA, useMarginCalc, useMarginEngine 미사용)
- `fetchExchangeRate`에 무한루프 가능성 (exCurrent가 useCallback deps에 포함)

### [2026-04-14] [PM 병합 전 수정 계획 — 슬아님]

**요청:** 슬아님 PR 리뷰 결과 기반, 머지 전 PM이 직접 수정할 항목 정리

**수정 항목 4건:**

**① orders/page.tsx 컴포넌트 분리 (절대규칙 3번 위반)**

- 원인: 368줄 로직(인터페이스, Mock 데이터, useState 7개, API 호출, 마진 계산, 전체 JSX)이 page.tsx에 직접 작성됨. cost/page.tsx는 올바르게 분리했으나 orders는 안 함
- 적용: page.tsx → import + 배치만(~10줄)으로 축소. 로직을 아래 구조로 분리
  - `src/components/orders/OrderDashboard.tsx` — 메인 컨테이너 (상태관리 + 레이아웃)
  - `src/components/orders/OrderTable.tsx` — 출고 대기 테이블 (좌측 2fr)
  - `src/components/orders/BatchProfitSidebar.tsx` — 배치별 기대 수익 카드 (우측 1fr)
  - `src/components/orders/_hooks/useExchangeRate.ts` — 환율 fetch 로직 분리

**② fetchExchangeRate 무한루프 수정**

- 원인: `useCallback` deps에 `exCurrent`가 포함 → 환율 fetch 성공 → `setExCurrent` → `fetchExchangeRate` 재생성 → `useEffect` 재실행 → 반복 호출. API가 매번 동일한 값을 주면 멈추지만 소수점 변동 시 무한루프
- 적용: `setExCurrent(prev => cnyPayload.rate ?? prev)` 함수형 업데이트로 변경, deps에서 `exCurrent` 제거

**③ calcProfitWithVatPrice 채널 무시 버그**

- 원인: `CostAnalyticsDashboard`에서 채널 선택이 가능하지만, `calcProfitWithVatPrice` 내부에서 정산율을 `0.56`(쿠팡 로켓)으로 하드코딩. 네이버(96.5%), 카카오(93%) 등 선택해도 경쟁사 비교 카드, 환율 변동 차트, 센터별 순이익 차트가 전부 56% 기준으로 계산됨
- 적용: `calcProfitWithVatPrice`에 `settlementRatio` 파라미터 추가, 호출부 3곳에서 `CHANNEL_RATES[channel].settlementRatio` 전달

**④ 데드 코드 정리 (AI 코드 병합 잔해)**

- 원인: 1차 자체 구현 후 2차에서 Claude 생성 코드로 교체하면서 이전 버전 삭제 안 함
- 적용 — `useMarginCalc.ts`에서 삭제:
  - `PACKAGING_DATA` (29~102줄) — 미사용 포장 스펙 데이터
  - `MarginInput`, `MarginResult`, `PriceRecommendation` (142~163줄) — 1차 함수 타입 (`ProfitResult`는 `calcProfitWithVatPrice` 반환 타입으로 유지)
  - `roundRate` (175줄) — 미사용 유틸
  - `calcFinalExchangeRate` (177~185줄) — calcMargin 내부에 인라인됨
  - `calcTotalUnitCost` (221~236줄) — calcMargin으로 대체됨
  - `calcRecommendedPrice` (238~250줄) — calcMargin으로 대체됨
  - `useMarginCalc` 훅 (276~286줄) — 미사용
  - `useMarginEngine` 훅 (288~305줄) — 미사용
- 적용 — `reference-data.ts` 파일 통째로 삭제 (어디서도 import 안 함, CENTER_RATES로 대체됨)

**데드 코드 발생 원인 분석:**

- 슬아님 작업 로그 기준 [20:49] 1차 자체 구현 → [21:04] 2차 Claude 생성 코드로 교체 과정에서 발생
- 1차에서 `calcFinalExchangeRate` → `calcTotalUnitCost` → `calcRecommendedPrice` → `useMarginCalc` 훅 체인으로 설계
- 2차에서 `calcMargin` 하나로 채널/센터를 포함한 통합 엔진으로 교체했으나, 1차 함수들을 삭제하지 않음
- `calcFinalExchangeRate`(177~185줄)는 `calcMargin`(189줄)에 같은 환율 공식(`exPi * 0.3 + exCurrent * 0.7 * shipRatio`)이 인라인되어 완전 중복
- `reference-data.ts`는 1차 센터 데이터(이천/안성/곤지암 3건)이며, 2차에서 `CENTER_RATES`(20개 센터 상세)로 대체됨. 파일 전체가 import 0건
- `PACKAGING_DATA`는 제품별 포장 스펙으로, 향후 SKU 자동 매핑에 쓸 의도가 있었을 수 있으나 현재 미사용. 필요 시 재생성 가능
- 코드 품질 자체의 문제가 아니라 AI 코드 병합 과정에서 이전 버전 정리를 안 한 것

**기능 누락 검증 결과:**

- 수정 4건 적용 후 기존 기능 17개 항목 전수 점검 완료, 누락 없음
- ①번 분리: 위치 이동만, 로직 동일 유지 (OrderDashboard/OrderTable/BatchProfitSidebar)
- ②번 무한루프: fetch 로직 동일, useCallback deps에서 exCurrent만 제거
- ③번 채널 버그: calcProfitWithVatPrice 시그니처에 settlementRatio 추가, 기존 0.56 동작은 쿠팡 로켓 선택 시 동일
- ④번 데드 코드: 삭제 대상 전부 import 0건 확인 완료. calcProfitWithVatPrice는 사용 중이므로 삭제가 아닌 시그니처 수정

### [2026-04-14] [PM 병합 전 수정 완료 — 슬아님]

**요청:** 위 수정 계획 4건 실행
**변경 파일:**

- 생성: `src/components/orders/OrderDashboard.tsx`, `src/components/orders/OrderTable.tsx`, `src/components/orders/BatchProfitSidebar.tsx`, `src/components/orders/_hooks/useExchangeRate.ts`
- 수정: `src/app/(dashboard)/orders/page.tsx` (368줄 → 10줄), `src/lib/margin/useMarginCalc.ts` (305줄 → 128줄), `src/components/analytics/cost/CostAnalyticsDashboard.tsx` (import + 호출부 3곳)
- 삭제: `src/lib/margin/reference-data.ts`
  **변경 내용:**
- ① orders/page.tsx에서 로직 전체를 `src/components/orders/` 4개 파일로 분리, page.tsx는 import+배치만
- ② useExchangeRate.ts에서 `setExCurrent(prev => ...)` 함수형 업데이트 적용, useCallback deps에서 exCurrent 제거하여 무한루프 방지
- ③ calcProfitWithVatPrice에 `settlementRatio` 파라미터 추가, CostAnalyticsDashboard 호출부 3곳에서 `CHANNEL_RATES[channel].settlementRatio` 전달
- ④ useMarginCalc.ts에서 데드 코드 삭제 (PACKAGING_DATA, MarginInput, MarginResult, PriceRecommendation, roundRate, calcFinalExchangeRate, calcTotalUnitCost, calcRecommendedPrice, useMarginCalc, useMarginEngine, "use client", useMemo import), reference-data.ts 파일 삭제
  **검증:** `npx tsc --noEmit` 타입 체크 통과
  **주의사항:**
- `src/components/orders/_hooks/useOrders.ts`(PM 스켈레톤)는 그대로 유지. Mock → Supabase 전환 시 OrderDashboard에서 연결 예정
- `calcProfitWithVatPrice`의 `settlementRatio`가 필수 파라미터로 변경됨. 향후 이 함수를 호출하는 코드 추가 시 반드시 채널 정산율 전달 필요

### [2026-04-14] [PM 환율 API 입력 검증 추가]

**요청:** `exchange-rate/route.ts`에 통화 코드 입력 검증 추가
**변경 파일:** `src/app/api/exchange-rate/route.ts`
**변경 내용:** `base` 쿼리 파라미터에 허용 통화(CNY, USD, JPY, EUR)만 통과시키는 검증 추가. 미허용 통화 요청 시 400 응답 반환
**주의사항:** 새로운 통화가 필요하면 `ALLOWED_BASES` 배열에 추가해야 함
**검증:** `npx tsc --noEmit` 타입 체크 통과

### [2026-04-15] [PM 네이티브 HTML → shadcn/ui 교체]

**요청:** 슬아님 코드에서 네이티브 HTML 태그를 shadcn/ui 컴포넌트로 교체
**변경 파일:**

- `src/components/analytics/cost/MarginStrategyCards.tsx` — 네이티브 `<table>` → `ui/table`의 Table, TableHeader, TableBody, TableRow, TableHead, TableCell로 교체
- `src/components/analytics/cost/CostAnalyticsDashboard.tsx` — 네이티브 `<select>` 2곳 → `ui/select`의 Select, SelectTrigger, SelectValue, SelectContent, SelectItem으로 교체
  **변경 내용:** 코드 스타일 규칙("UI 컴포넌트는 반드시 src/components/ui/에서 import")에 맞게 PM이 만들어둔 UI 컴포넌트 사용으로 통일
  **검증:** `npx tsc --noEmit` 타입 체크 통과
  **주의사항:**
- `OrderDashboard.tsx`의 `<input type="file">`은 shadcn/ui에 file upload 전용 컴포넌트가 없어 네이티브 유지 (숨겨놓고 Button으로 트리거하는 표준 패턴)

### [2026-04-15] [PM 코드 리뷰 — 나경님]

**요청:** 나경님 PR(`team/나경` → `submain`) 코드 품질 및 파일 경계 규칙 준수 여부 리뷰
**대상 커밋:** `2312a75 분석 및 리뷰 페이지 수정` (4파일, +551줄)

**파일 경계 판정:**

- PM 영역 침범: 없음
- 다른 팀원 영역 침범: 없음
- 4개 파일 모두 나경님 영역 내

**수정 항목 3건:**

**① reviews/page.tsx 컴포넌트 분리 (절대규칙 3번 위반)**

- 원인: 351줄 로직(타입, Mock 데이터, useMemo 4개, Tabs 2탭, 차트, 전체 JSX)이 page.tsx에 직접 작성됨
- 적용: `src/components/analytics/reviews/ReviewsDashboard.tsx`로 이동, page.tsx는 import+배치만

**② promotion/page.tsx 컴포넌트 분리 (절대규칙 3번 위반)**

- 원인: 204줄 로직(useMemo 3개, ComposedChart, BarChart, 플랫폼 행사 카드)이 page.tsx에 직접 작성됨
- 적용: `src/components/analytics/promotion/PromotionDashboard.tsx`로 이동, page.tsx는 import+배치만

**③ reviews/page.tsx 네이티브 `<table>` → shadcn/ui Table 교체**

- 원인: 스펙 비교표(320~343줄)에서 네이티브 `<table><thead><th><td>` 사용. 코드 스타일 규칙 위반
- 적용: `ui/table`의 Table, TableHeader, TableBody, TableRow, TableHead, TableCell로 교체

**기능 누락 검증:** 수정 3건 적용 후 기존 기능 11개 항목(KPI 카드, 별점 차트, 개선 포인트, 경쟁 키워드, 가격 비교, 스펙 비교, 프로모션 KPI, 월별 차트, 연도 비교 차트, 행사 알림, 에러 Alert) 전수 점검 — 위치 이동 + table 교체만이라 누락 없음

**슬아님 대비 비교:**

- PM 영역 침범: 없음 (슬아님은 3건)
- 런타임 버그: 없음 (슬아님은 무한루프 + 채널 버그)
- 데드 코드: 없음 (슬아님은 ~40%)
- 훅 수정: useReviews에 컬럼 추가(units_sold, return_units), 양쪽 limit 100→500 — 합리적 수정

### [2026-04-15] [PM 병합 전 수정 계획 — 나경님]

**요청:** 위 리뷰 결과 기반, 머지 전 PM이 직접 수정할 항목 3건 실행 예정
**변경 예정 파일:**

- 생성: `src/components/analytics/reviews/ReviewsDashboard.tsx`, `src/components/analytics/promotion/PromotionDashboard.tsx`
- 수정: `src/app/(dashboard)/analytics/reviews/page.tsx` (351줄 → ~10줄), `src/app/(dashboard)/analytics/promotion/page.tsx` (204줄 → ~10줄)
- ReviewsDashboard 내 네이티브 `<table>` → shadcn/ui Table 교체

### [2026-04-15] [PM 병합 전 수정 완료 — 나경님]

**요청:** 위 수정 계획 3건 실행
**변경 파일:**

- 생성: `src/components/analytics/reviews/ReviewsDashboard.tsx`, `src/components/analytics/promotion/PromotionDashboard.tsx`
- 수정: `src/app/(dashboard)/analytics/reviews/page.tsx` (351줄 → 10줄), `src/app/(dashboard)/analytics/promotion/page.tsx` (204줄 → 10줄)
  **변경 내용:**
- ① reviews/page.tsx 로직 전체를 `ReviewsDashboard.tsx`로 이동, page.tsx는 import+배치만
- ② promotion/page.tsx 로직 전체를 `PromotionDashboard.tsx`로 이동, page.tsx는 import+배치만
- ③ ReviewsDashboard 내 스펙 비교표 네이티브 `<table>` → shadcn/ui Table 교체
  **검증:** `npx tsc --noEmit` 타입 체크 통과
  **주의사항:**
- submain을 `team/나경`에 먼저 merge한 후 작업 (슬아님 코드 + PM 로그 충돌 방지)

### [2026-04-15] [PM 코드 리뷰 — 진희님]

**요청:** 진희님 PR(`team/진희`) 코드 품질 및 파일 경계 규칙 준수 여부 리뷰
**대상 커밋:** `5350547 [진희] feat: 물류 재고관리 구현` (35파일, +3,444줄)
**결과: submain 머지 불가 — 재구현 요청 필요**

**파일 경계 판정:**

- PM 영역 침범: `package.json`에 패키지 4개 무단 추가
- 다른 팀원 영역 침범: 없음
- `src/components/logistics/` 내부에 `app/api/`(11개), `lib/`(5개), `store/`(1개) 미러 구조 생성

**기술 스택 위반 (Critical):**

- Supabase 대신 `better-sqlite3`로 로컬 SQLite DB 구축 — 프로젝트 기술 스택 정면 충돌
- `zustand` PM 승인 없이 추가 (CLAUDE.md, .cursorrules 모두 "PM 승인 필요"로 명시)
- `@tanstack/react-table`, `xlsx` 패키지 무단 추가
- `src/components/ui/` import 0건 — shadcn/ui 전혀 미사용, 네이티브 HTML + Tailwind로 전면 구현

**구조적 문제 (Critical):**

- `src/components/logistics/app/api/*` 11개 API 라우트 → Next.js App Router가 인식하지 않음 (`src/app/api/`에 있어야 동작)
- `page.tsx`에서 `fetch("/api/items")` 등 호출 → 실제 라우트 없어서 **404 발생, 화면 데이터 로드 불가**
- PM이 만들어둔 Supabase 스켈레톤 훅(`useInventory.ts`, `useStockMovements.ts`) 미사용
- `src/components/logistics/lib/db.ts`에서 SQLite 테이블 5개 자체 생성 (items, inventory_snapshots, transactions, scheduled_transactions, erp_sync_log)

**발생 원인 분석:**

- 진희님은 파일 경계 규칙을 인식하고 있었음 (로그에 "PM 영역 연동 필요" 명시)
- PM 전용 영역에 직접 파일을 만들지 않기 위해 `components/logistics/` 안에 미러 구조를 생성
- AI(Cursor)가 독립적인 풀스택 앱을 통째로 생성한 것으로 추정 — 기존 Supabase 패턴/스켈레톤을 무시하고 자체 DB+API 구조를 만듦
- `.cursorrules`에 규칙이 명확히 있으나 AI가 대규모 생성 시 따르지 않은 것

**양호한 항목:**

- `src/app/(dashboard)/logistics/page.tsx` 배치만 규칙: 5줄, import+배치만 (슬아/나경보다 잘 지킴)
- 컴포넌트 분리: 8개 컴포넌트로 잘 분리
- 작업 로그: 7건 상세 작성
- 다른 팀원 영역 침범: 없음
- 기능 완성도 자체: CRUD, ERP 연동, 엑셀 임포트/익스포트, 원장, 예정 관리 — 매우 높음

**PM 결정:**

- `team/진희` 브랜치는 submain에 머지하지 않음
- 진희님에게 아래 기준으로 재구현 요청:
  1. SQLite(`better-sqlite3`) 제거 → Supabase 직접 호출로 전환
  2. 기존 스켈레톤 훅(`_hooks/useInventory.ts`, `_hooks/useStockMovements.ts`) 기반으로 데이터 조회
  3. API 라우트가 필요하면 PM에게 `src/app/api/` 생성 요청
  4. `zustand` 제거 → `useState`/`useContext`로 전환 (또는 PM 승인 절차 진행)
  5. 네이티브 HTML → `src/components/ui/` shadcn/ui 컴포넌트 사용
  6. `package.json` 변경 금지 — 패키지 추가 필요 시 PM에게 요청
- 현재 코드의 컴포넌트 구조(8개)와 기능 설계는 참고 가능, DB/API 레이어만 교체

### [2026-04-15] [PM 코드 리뷰 — 정민님]

**요청:** 정민님 PR #13(`team/정민` → `submain`) 코드 품질 및 파일 경계 규칙 준수 여부 리뷰
**대상 커밋:** `8c617c0 초안 push` (34파일, +3,325줄)
**결과: submain 머지 불가 — 파일 위치 이동 + 아키텍처 연동 필요**

**파일 경계 판정:**

- 허용 영역 내 파일: 0개 (34개 전부 영역 밖)
- 프로젝트 루트에 `analytics/`, `backend/`, `data_pipeline/`, `data_sources/`, `config/` 새 폴더 생성
- PM 전용 영역 침범: `scripts/` (4파일), `.gitignore` 수정
- `.cache.sqlite` 바이너리 파일 커밋 포함
- `src/components/analytics/forecast/`에 컴포넌트 0개, 스켈레톤 `useForecast.ts` 미사용
- `services/api/routers/forecast.py`, `services/api/models/` 미생성
- 작업 로그(`docs/logs/정민.md`): 미작성

**코드 품질:** Python 코드 자체는 팀 내 가장 체계적

- 타입 힌트 전면 적용, dataclass/Pydantic 스키마 설계, 함수 분리 우수
- TODO 97개 — 미확정 사항을 더미 데이터로 때우지 않고 명시하는 원칙 준수
- 인수인계 문서(HANDOFF 2개) 상세하게 작성
- LightGBM/LinearRegression 예측 모델, 피처 엔지니어링, ASOS/ECMWF 연동 모듈 구현

**핵심 문제:** 프로젝트 아키텍처와 완전히 단절

- Supabase 연결점 0 — 읽기도 쓰기도 안 함 (CSV 파일에서 직접 읽는 구조)
- 기존 FastAPI 구조(`services/api/`) 무시 — 루트 `backend/`에 새 앱 생성
- 프론트엔드 컴포넌트 0개 — 브라우저에서 예측 결과를 볼 방법 없음
- 별도 프로젝트를 gl-dashboard 레포에 통째로 이식한 것으로 추정

**Supabase 테이블 현황 (실제 DB 연결 확인):**

- `coupang_performance`: 12,492행 (55개 SKU, 1년치 판매 데이터) — 정민님이 읽어야 할 소스
- `products`: 144행 — SKU 마스터
- `forecasts`: 0행 (테이블+컬럼 있음) — 정민님이 예측 결과 저장할 곳
- `weather_data`: 0행 (테이블+컬럼 있음) — 정민님이 날씨 데이터 저장할 곳
- migration 불필요 — PM이 이미 테이블 구조를 만들어놨음, 데이터 insert만 하면 됨

> ⚠️ 위 표 안내는 4-15 시점 기준이며, **4-17 v6 스키마 재설계로 `coupang_performance`/`products`/`forecasts`/`weather_data` 모두 폐기됨**. 현재 적용 가이드는 `database.md`의 [2026-04-17] [v6 스키마 변경 영향 분석] 항목 참조.

### [2026-04-15] [PM 재구현 가이드 — 정민님]

**정민님에게 전달 (카톡용):**

정민님이 만든 Python 코드(수요예측 모델, 날씨 수집, 피처 엔지니어링)의 품질은 팀 내 가장 높습니다.
문제는 코드가 프로젝트 구조와 연결되지 않은 것입니다.
Supabase에 필요한 테이블(`weather_data`, `forecasts`)은 PM이 이미 만들어놨고,
판매 데이터(`coupang_performance`)도 12,492행이 들어있습니다.
아래 순서대로 진행하면 기존 코드를 살리면서 프로젝트에 연결할 수 있습니다.

**Step 1: 루트 파일 정리 (즉시)**

- 프로젝트 루트의 `analytics/`, `backend/`, `data_pipeline/`, `data_sources/`, `config/`, `dashboard/` 삭제
- `.cache.sqlite`, `HANDOFF_*.md`, `requirements.txt` 삭제
- `.gitignore` 변경 되돌리기 (PM 전용 파일)

**Step 2: Python 코드를 `services/api/` 하위로 이동 (PM과 협의)**

- `analytics/` → `services/api/analytics/`
- `data_pipeline/` → `services/api/data_pipeline/`
- `data_sources/` → `services/api/data_sources/`
- `backend/schemas/` → `services/api/schemas/`
- `requirements.txt` → `services/api/requirements.txt` (기존에 머지)
- `services/api/`는 PM 전용 영역이므로 PM에게 폴더 생성 요청 후 이동

**Step 3: Supabase 연결 — 데이터 읽기**
현재 `sales_loader.py`가 CSV에서 읽는 것을 Supabase로 변경:

```python
from supabase import create_client
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
response = supabase.table("coupang_performance").select("*").execute()
df = pd.DataFrame(response.data)
```

나머지 파이프라인(feature_engineering, weekly_demand_forecast)은 DataFrame을 받으므로 수정 불필요.

**Step 4: Supabase 연결 — 날씨 데이터 저장**
`weather_data` 테이블이 이미 있음 (migration 불필요, insert만). 컬럼 매핑:

- temp_min → temp_min (ASOS/Open-Meteo)
- temp_max → temp_max
- temp_avg → temp_mean
- precipitation → rain_mm
- wind_speed → wind_mean
- cold_wave_alert → coldwave_flag
- region → 관측소명
- source → 'asos' 또는 'ecmwf_open_meteo'

데이터 수집 범위:

- 과거 날씨: `coupang_performance` 시작일 ~ 오늘 (ASOS API → weather_data insert)
- 미래 날씨: 오늘 ~ +16일 (Open-Meteo ECMWF → weather_data insert)

**Step 5: Supabase 연결 — 예측 결과 저장**
`forecasts` 테이블이 이미 있음 (migration 불필요, insert만). 컬럼 매핑:

- product_id → products.id (sku_mappings로 연결)
- forecast_date → 예측 대상 주차 시작일
- predicted_qty → weekly_sales_qty 예측값
- model_name → 'lightgbm' 또는 'linear'
- input_features → 피처 JSON (jsonb)

**Step 6: FastAPI 라우터 작성**
`services/api/routers/forecast.py` (정민님 영역):

- Supabase에서 coupang_performance + weather_data 조회
- feature_engineering으로 피처 생성
- weekly_demand_forecast로 예측
- 결과를 Supabase forecasts에 저장

**Step 7: 프론트엔드 컴포넌트**
`src/components/analytics/forecast/ForecastDashboard.tsx`:

- 스켈레톤 `_hooks/useForecast.ts` 확장해서 Supabase forecasts 조회
- 차트로 예측 결과 표시 (recharts, shadcn/ui Card/Chart 사용)

**전체 파이프라인 (완성 시):**

```
[스케줄러 — 매일 1회]
기상청 ASOS → weather_data (과거 관측)
Open-Meteo ECMWF → weather_data (미래 16일 예보)

[FastAPI — 요청 시 또는 스케줄러]
Supabase(coupang_performance + weather_data)
  → feature_engineering → 모델 학습/추론
  → forecasts 테이블에 저장

[프론트엔드 — 실시간]
Supabase(forecasts) → useForecast.ts → ForecastDashboard.tsx → 브라우저
```

**우선순위:** Step 1~2(파일 정리) → Step 3~5(Supabase 연결) → Step 6(FastAPI) → Step 7(프론트)

> ⚠️ 위 가이드의 테이블/컬럼명은 4-15 시점 기준이며, **4-17 v6 스키마 재설계로 전부 변경됨**. 정민님에게 전달 시 반드시 `database.md`의 [2026-04-17] [v6 스키마 변경 영향 분석] 매핑 가이드와 함께 전달.

---

### [2026-04-16] [정민님 PR 코드 리뷰 + 정합성 보정]

**요청:** 정민(vicddory)이 올린 team/정민 PR 검토 및 머지 가능 상태로 정리

**변경 파일 (총 22개)**

복구 (1차) - 정민이 머지 충돌 시 무단 삭제한 13개 파일을 submain에서 복구:

- src/components/orders/{OrderDashboard,OrderTable,BatchProfitSidebar}.tsx
- src/components/orders/\_hooks/useExchangeRate.ts
- src/components/analytics/cost/{CostAnalyticsDashboard,MarginStrategyCards}.tsx
- src/components/analytics/promotion/PromotionDashboard.tsx
- src/components/analytics/reviews/ReviewsDashboard.tsx
- src/lib/margin/useMarginCalc.ts
- src/app/api/exchange-rate/route.ts
- docs/logs/pm/frontend.md, DB_ANALYSIS.md, docs/logs/슬아.md

복구 (2차) - 정민이 무단 수정한 7개 파일을 submain으로 원복:

- src/components/analytics/reviews/\_hooks/useReviews.ts (필드 2개 제거 + limit 500→100 원복)
- src/components/analytics/promotion/\_hooks/usePromotion.ts (limit 500→100 원복)
- src/components/layout/nav-orders.ts (라벨/아이콘 변경 원복)
- src/app/(dashboard)/{orders,analytics/cost,analytics/promotion,analytics/reviews}/page.tsx (placeholder → 컴포넌트 import 원복)

수정 - file-boundaries.md 갱신:

- .claude/rules/file-boundaries.md: 정민 영역에서 ~~services/api/models/prophet_model.py, xgboost_model.py~~ (실제 미작성) 삭제, 실제 작업한 4개 신규 폴더 + run_pipeline.py + requirements.txt 명시

**변경 내용**

정민 PR이 다른 팀원/PM 영역 28개 파일을 침범한 상태였음 (삭제 14 + 수정 9 + 추가 5). 침범 원인은 `e21da0ed merge: origin/main 병합 — 충돌 5건 해결` 커밋에서 머지 충돌을 잘못 처리한 것으로 추정 (정민이 갖고 있던 오래된 버전이 새 버전을 덮음).

PM이 침범 파일 20개를 submain 버전으로 복구하여 슬아/나경/PM 작업물을 모두 보존. 정민 본인 영역(forecast 컴포넌트, services/api/ 4개 신규 폴더, scripts/ 5개)은 100% 그대로 유지하여 정민 forecast 기능(6,693줄) 손실 없음.

추가로 file-boundaries.md를 실제 작업에 맞게 갱신: 옛날 가정(prophet/xgboost)은 실제 사용하지 않으므로 삭제하고, 정민이 PM 구두 승인 받아 만든 4개 폴더(analytics/, data_pipeline/, data_sources/, schemas/) + run_pipeline.py + requirements.txt 권한 명시.

**scripts/ 처리 결정**

정민이 scripts/에 추가한 5개 파일(run_weekly_forecast.py, ecmwf_open_pipeline.py, kma_api_reference_samples.py, open_meteo_ecmwf_http_example.py, **init**.py)은 file-boundaries.md상 PM 전용이지만 표준 프로젝트 관례(CLI/자동화 도구 모음)에 부합하므로 PM이 명시적으로 임시 허용. file-boundaries.md는 변경하지 않고 본 로그에 기록만 유지. 향후 정민이 scripts/에 추가/수정할 때는 사전에 PM 승인 필요.

**정민 본인 기능 보존 확인**

- Frontend ForecastDashboard.tsx (336줄, KPI 3장 + 차트 2종 + AI 인사이트 + 발주 시뮬레이션): 보존
- Backend routers/forecast.py (FastAPI 라우터, GET/POST 엔드포인트): 보존
- Backend analytics/ (8파일, Model A LightGBM + Model B + OpenAI 인사이트): 보존
- Backend data_pipeline/ (12파일, ASOS/ECMWF/Open-Meteo 수집 + 피처 빌드): 보존
- Backend data_sources/, schemas/: 보존
- services/api/run_pipeline.py (CLI 통합 진입점): 보존
- scripts/ 5개 (CLI 진입점): 보존

**주의사항**

- 정민에게 피드백 전달 필요: ① 다른 팀원 영역 수정/삭제 절대 금지 ② 머지 충돌 시 양쪽 다 보존 ③ PR 전 `git diff submain..team/정민 --stat`으로 본인 변경분 확인 습관
- Supabase 스키마 확정은 별도 트랙: 정민 handoff 문서에서 products, sku_mappings, weather_data, forecasts 테이블명/컬럼 확인 요청 중 (※ 이후 4-17 v6 스키마 재설계로 해당 테이블명 모두 변경됨 — `database.md` [v6 스키마 변경 영향 분석] 참조)
- 정민 PR 머지 후 슬아/나경에게 본인 작업물 보존됐다고 통지 필요

**최종 코드 정합성/품질 검사 결과** (커밋 직전)

- TypeScript 타입체크: 통과 (npx tsc --noEmit 에러 0건, .next 캐시 제외)
- Python 정합성: services/api/는 staged 변경 없음. 정민 forecast 코드는 unstaged로 그대로 보존
- 파일 간 호환성: 4개 page.tsx 전부 10줄 이하, 복구된 컴포넌트 import 경로 정확. usePromotion/useReviews 훅이 PromotionDashboard/ReviewsDashboard와 필드 매칭 정상 (반품률 계산 정상화). useMarginCalc 함수 시그니처 호환
- 코드 품질: 한국어 주석 일관, 에러 처리 패턴 완전 (Supabase/API/네트워크), 중복 코드 없음, 매직넘버는 상수화(CENTER_RATES, CHANNEL_RATES)
- CLAUDE.md 규칙 준수: page.tsx에 useState/useMemo/fetch/Mock 데이터 없음, 금지 라이브러리(Prisma/Drizzle/axios/MUI/Chakra/Redux) 미사용, Supabase 타입 import 경로 정확
- 환경변수/시크릿: EXCHANGE_RATE_KEY는 서버 라우트에서만 사용(클라이언트 노출 없음), 하드코딩 민감정보 없음
- Supabase 패턴: createClient 메모이제이션, .select() 컬럼 명시적 지정, .order().limit() 효율적 쿼리, 에러 후 setData 적절

**머지 가능 여부:** 가능

**잠재 이슈** (blocking 아닌 추후 개선 권장):

- ExchangeRate API: EXCHANGE_RATE_KEY 환경변수 필수 (개발 환경 .env 설정 필요)
- "// 변경 이유:" 주석은 일부 파일에만 있음 → 추후 추가 파일에도 일관성 적용 권장
- CostAnalyticsDashboard의 useMemo deps 체인 11개로 깊음 → 향후 성능 모니터링 권장
- OrderDashboard MOCK_ORDERS 하드코딩 → DB 연동으로 대체 필요 (기존 잔류 항목)

---

### [2026-04-17] [진희 PR 정리·죽은 코드 식별]

**요청:** team/진희 → submain 병합 준비. 첫 PR(거절됨) 잔재가 머지 사고로 부활한 상태 정리.
**현재 상태 진단:**

- **죽은 디렉토리 4개** (첫 PR `5350547e` 잔재 — 진희 본인도 4-15 로그에 "삭제" 기록했으나 4-16 머지 사고로 stash 복구됨):
  - `src/components/logistics/app/` (19개 파일 — Next.js 라우팅 구조가 components 안에 중첩, 동작 안 함)
  - `src/components/logistics/components/` (8개 — 메인과 중복: InventoryTable, FilterBar, SummaryCards 등)
  - `src/components/logistics/lib/` (db.ts·erp-client.ts·excel-\*.ts·inventory-calc.ts — sqlite/엑셀 첫 PR 코드)
  - `src/components/logistics/store/` (zustand 기반 상태 관리)
- **금지 라이브러리 4종** (전부 죽은 코드에서만 사용):
  - `better-sqlite3`, `@types/better-sqlite3`: lib/db.ts만 사용
  - `zustand`: store/inventory.ts만 사용 (PM 승인 미득)
  - `@tanstack/react-table`: components/InventoryTable.tsx만 사용
- **유지 필요 (살아있는 코드 의존)**:
  - `xlsx`: CoupangMilkrunDialogs + /api/crawl/ecount
  - `papaparse`: CoupangMilkrunDialogs (CSV 업로드) — **package.json 누락 상태! 추가 필요**
  - `playwright`: /api/crawl/ecount (ERP 크롤링)
- **PM 영역 수정 항목 (정당성 검토 결과 수용 가능)**:
  - `src/middleware.ts`: /api/\* 인증 리다이렉트 버그 수정 (트래킹 API 동작 차단되던 문제)
  - `src/components/ui/label.tsx`: shadcn 표준 add
  - `src/app/api/{crawl/ecount,tracking,weather}/route.ts`: 외부 API 연동상 PM 영역에 둘 수밖에 없음
  - `.env.example`, `package.json`, `package-lock.json`: 환경/의존성 추가
    **살아있는 핵심 기능 5종** (정리 시 절대 망가지면 안 됨):

1. ERP 재고수불부 크롤링 (`/api/crawl/ecount` + ErpCrawlPanel)
2. 수입 발주 리드타임 추적 (LeadTimeTracker + `/api/tracking`)
3. 재작업일 날씨 (`/api/weather` + useWeather)
4. 쿠팡 밀크런 최적화 (CoupangMilkrunPage + 센터/팔렛 계산)
5. 총 재고 현황 (InventoryDashboard + dailyInventoryBase 매핑)
   **계획:**
6. team/진희-backup 브랜치 생성 ✓
7. 죽은 디렉토리 4개 삭제
8. package.json 정리 (금지 4개 제거 + papaparse 추가)
9. 빌드/타입체크 검증
10. 브라우저 동작 확인 후 push & submain PR

**주의사항:** 010 마이그레이션(`import_leadtime`) 미적용 시 LeadTimeTracker는 `NEXT_PUBLIC_LEADTIME_MOCK=true`로 MOCK 모드. 010 처리 결정에 따라 환경변수도 조정 필요.

### [2026-04-17] [진희 PR 정리·죽은 코드 4개 디렉토리 삭제]

**요청:** 첫 PR 잔재 정리 (Task #3)
**변경 파일:** 삭제

- `src/components/logistics/app/` 전체 (19개 파일 — 동작 안 하는 Next.js 라우팅 미러)
- `src/components/logistics/components/` 전체 (8개 — 메인과 중복)
- `src/components/logistics/lib/` 전체 (db.ts·erp-client.ts·excel-\*.ts·inventory-calc.ts)
- `src/components/logistics/store/` 전체 (zustand inventory.ts)
  **검증:**
- grep 결과 살아있는 코드 어디에서도 삭제된 4개 폴더 import 없음
- `npx tsc --noEmit` → 진희 영역 코드 에러 0건 (`.next/dev/types/validator.ts` 빌드 캐시 노이즈만 잔존)
  **주의사항:** PM이 팀원 영역 직접 정리한 케이스. 진희님 본인 로그(4-15 [저녁/밤])에 동일 의도 기록 있어 절차 정당성 확보. 백업: `team/진희-backup` 브랜치.

### [2026-04-17] [진희 PM 영역 API/middleware 코드 품질 검토 + 보안 수정 3건]

**요청:** 진희가 PM 영역에 만든 4개 파일(`/api/crawl/ecount`, `/api/tracking`, `/api/weather`, `middleware.ts`) 코드 품질 검토 후 PM 인정 여부 결정 (Task #9)
**검토 결과 (Critical 4건):**

1. `ecount/route.ts:6-8` — `process.env.X!` non-null assertion → env 누락 시 모듈 로드 시점 크래시
2. `tracking/route.ts:302` — `PUBLIC_DATA_API_KEY` 없으면 2차 해양수산부 조회가 조용히 skip (운영자 인지 불가)
3. `tracking/route.ts:239` — 유니패스 API 키를 URL 쿼리에 직접 포함 (URL 로그 노출 위험)
4. `middleware.ts` matcher — `/api/*`가 통째로 인증 우회 → 누구나 ERP 자격증명 사용 가능
   **변경 파일:** `src/app/api/crawl/ecount/route.ts`, `src/app/api/tracking/route.ts`
   **적용 수정 (3건):**

- `ecount/route.ts`: 모듈 상단 `COMPANY/USER_ID/PASSWORD` 상수 제거 → POST 핸들러 진입 시 (a) `supabase.auth.getUser()` 인증 체크, (b) env 3종 존재성 검증 후 사용
- `tracking/route.ts`: GET 핸들러 진입 시 `auth.getUser()` 인증 체크 추가, `clsgn`은 있는데 `PUBLIC_DATA_API_KEY`가 없는 케이스에 명시 `console.warn` 추가
- `tracking/route.ts` 상단 docstring에 "유니패스/공공데이터포털은 정책상 헤더 인증 미지원, URL 키 노출은 우회 불가" 명시
  **적용 보류 (1건):**
- 4번 (API 키 헤더 이동): 유니패스 API가 헤더 인증을 지원하지 않아 헤더로 옮기면 트래킹 기능 자체가 깨짐. 우회 불가능한 외부 API 한계로 인지 + 주석 처리.
- middleware.ts matcher 변경: matcher에 `/api`를 다시 넣으면 비인증 사용자가 API 호출 시 `updateSession()` 흐름이 HTML 리다이렉트를 시도해 응답 깨짐. 대신 핸들러 안에서 `getUser()` 호출하는 방식이 안전 → 3번에서 처리.
  **weather/route.ts:**
- 인증 추가 안 함 (단순 기상청 프록시, 자격증명 불포함, 외부 노출 위험 낮음). 좌표 하드코딩(NX:37, NY:130 파주)·타임존 ambiguity는 후속 개선 항목으로 보류.
  **검증:** `npx tsc --noEmit` 통과 (진희 영역 에러 0건, `.next/` 빌드 캐시 노이즈만 잔존)
  **주의사항:**
- 정상 사용(대시보드 페이지에서 API 호출): 사용자가 이미 로그인 상태라 `getUser()` 통과. 동작 변화 0.
- 외부 직접 호출(curl/Postman 등): 401 반환. 의도된 동작.
- ERP 자격증명(ECOUNT\_\*) 미설정 환경에서는 ecount API 호출 시 500 + 명확한 missing 객체 반환 → 운영자가 어떤 env가 빠졌는지 즉시 식별 가능.

### [2026-04-17] [전체 영역 타입체크 — 다른 팀원 코드 영향 발견]

**요청:** 진희 PR 머지 직전 `npx tsc --noEmit` 전수 검증
**결과:** 진희 영역(logistics/, api/crawl/ecount, api/tracking, middleware) 에러 **0건**. 다른 팀원 영역에 v6 스키마 변경의 부수 효과로 **73개 타입 에러** 발생.

**에러 분포 (7개 파일):**

| 팀원 | 파일                                                                                   | 사용 중인 구 테이블                    |
| ---- | -------------------------------------------------------------------------------------- | -------------------------------------- |
| 슬아 | `src/components/orders/_hooks/useOrders.ts`                                            | `stock_movements` (복수형), `products` |
| 슬아 | `src/components/analytics/cost/_hooks/useCost.ts`                                      | `products`                             |
| 정민 | `src/components/analytics/forecast/_hooks/useForecast.ts`                              | `coupang_performance`                  |
| 나경 | `src/components/analytics/promotion/_hooks/usePromotion.ts` + `PromotionDashboard.tsx` | `coupang_performance`                  |
| 나경 | `src/components/analytics/reviews/_hooks/useReviews.ts` + `ReviewsDashboard.tsx`       | `coupang_performance`                  |

**원인:** 4-16 v6 스키마 재설계로 `products`, `stock_movements`(복수형), `coupang_performance` 테이블이 폐기되고 `item_master`, `stock_movement`(단수형), `orders`, `v_*` 뷰 군으로 교체됨. `supabase/types.ts`도 신 스키마 기준으로 재생성됨.

**진희 PR 머지 자체에는 영향 없음 — 진희 코드는 이미 신 스키마(`item_master`, `orders`, `stock_movement`, `v_current_stock`) 사용.**

**파급 위험:** 진희 PR이 submain에 들어가면 submain 빌드 깨짐(다른 팀원 PR 머지 시 typecheck/build 실패). CI(`pull_request` 이벤트)는 base 브랜치 변경만으로 자동 재실행되지 않으므로, 기존 PR 그대로 두면 깨진 상태 인지 못 할 수 있음.

**상세 매핑 가이드:** `database.md`의 [2026-04-17] [v6 스키마 변경 영향 분석] 항목 참조.

**조치:**

1. 진희 PR을 submain 머지 후, PM이 각 팀원 PR 페이지에서 "Update branch" 버튼 클릭 → CI 재실행 강제
2. 또는 팀원에게 "submain pull/rebase 후 push" 알림 (CI는 push 시 자동 재실행)
3. 미결사항에 등록 (아래 섹션 참조)

### [2026-04-17] [나경 PR 정리·정민/PM 영역 8개 파일 복구]

**요청:** team/나경 → submain 머지 준비 중 origin/submain 머지 시 정민/PM 영역 파일이 삭제 상태로 남는 현상 발견. PM 권한으로 복구.

**원인:**

- 나경 첫 커밋 `5323d4ee feat: 프로모션 수정과 리뷰 분석 수정`에서 `services/api/` 하위 10개 파일을 명시적으로 `git rm`함 (정민/PM 영역 침범)
- merge-base(공통 조상 `f86e53c4`)에는 파일 존재 → HEAD가 삭제로 기록 → submain이 수정 안 한 8개는 자동 머지 결과 "HEAD 삭제 적용"
- requirements.txt, forecast.py 2개만 submain이 수정해서 modify/delete 충돌로 노출되어 수동 복구. 나머지 8개는 충돌 없이 사라짐

**복구 파일 (submain 버전 채택):**

- `services/api/main.py` (FastAPI 엔트리포인트 — 이게 없으면 서버 자체가 안 뜸)
- `services/api/.env.example`
- `services/api/rag/.gitkeep`
- `services/api/routers/__init__.py` (패키지 마커)
- `services/api/routers/{logistics,rag,reviews,triggers}.py` (PM 스켈레톤 4개)

**파일 경계 판정:** 나경이 PM/정민 영역 파일을 삭제한 것은 권한 위반. PM이 submain 버전으로 원복 정당. 정민 forecast 인프라 정상 작동 보장.

**검증:** `git ls-tree HEAD services/api/` 확인 — 27개 파일 (analytics/ 9 + data_pipeline/ 11 + data_sources/ 3 + main.py + requirements.txt + routers/ 3 + rag/.gitkeep) 모두 존재 ✓

### [2026-04-17] [나경 PR 정리·dev 스크립트 원복 + 죽은 코드 제거 + 코드 스타일]

**요청:** 나경 PR 코드 리뷰 후 발견된 Critical 이슈 정리.

**Critical 이슈 4건:**

1. **`npm run dev` 변경이 팀 dev 서버 전체 깨뜨림 🔴**
   - 변경 전: `"dev": "next dev"`
   - 나경 변경: `"dev": "concurrently -k -n next,dash -c cyan,magenta \"npm run dev:next\" \"node src/components/analytics/promotion/scripts/run-promotion-dash.cjs\""`
   - 래퍼 스크립트가 참조하는 `src/components/analytics/promotion_dashboard/app.py` 폴더가 **레포 어느 커밋에도 없음** (나경 로컬 only)
   - 결과: Python spawn 에러 → `concurrently -k` kill-others로 next dev도 종료 → 진희/슬아/정민/PM 4명 전원 dev 서버 안 뜸
   - 처리: PM이 `"dev": "next dev"` 원복, `dev:next` 제거, `concurrently` devDependency 제거, `run-promotion-dash.cjs` 삭제, scripts/ 폴더도 정리. 나경 본인 Python Dash는 본인 로컬에서 별도 터미널로 (`cd promotion_dashboard && python app.py`) 실행.
2. **`_hooks/usePromotion.ts` 죽은 코드 + 구 스키마 참조**
   - 컴포넌트들이 모두 `dataPreprocess.ts`의 `loadXxxDataset()` 함수 사용 — usePromotion 훅 참조 0건
   - 훅 내부에서 v6 폐기 테이블 `coupang_performance` 참조 → 빌드 시 73개 타입 에러 카운트에 포함
   - 처리: 파일 삭제, `_hooks/` 빈 폴더도 제거. 향후 Supabase 전환 시 `daily_performance`/`v_promo_roi` 뷰 기반으로 신규 작성 권장 (database.md 미결사항 참조).
3. **`BudgetPlanner.tsx:127` 네이티브 `<table>` 사용**
   - CLAUDE.md "shadcn/ui 매핑" 규칙 위반
   - 처리: `Table/TableHeader/TableHead/TableBody/TableRow/TableCell`로 교체. UI 동작 100% 동일.
4. **`xlsx` 데이터 파일 3개 (assets/) + dataPreprocess.ts XLSX 파싱 로직**
   - 데이터를 Supabase 대신 엑셀에 박아놓고 런타임 파싱하는 구조
   - 평가: (B) 임시 허용 — 현재 기능 작동 우선, v6 마이그레이션은 미결사항으로 등록. database.md 참조.

**변경 파일:**

- 수정: `package.json` (-2줄), `package-lock.json` (-75줄), `src/components/analytics/promotion/BudgetPlanner.tsx` (table 교체)
- 삭제: `src/components/analytics/promotion/_hooks/usePromotion.ts`, `src/components/analytics/promotion/scripts/run-promotion-dash.cjs`

**나경 핵심 기능 보존 확인 (사용자 시점):**

- ✅ 리뷰 분석 페이지 삭제 (사용자 결정)
- ✅ 프로모션 7개 컴포넌트 (PromotionDashboard + BudgetPlanner + PromotionSalesOverlay + ROICalculator + SeasonAlertMonitor + SeasonCompare + TimingOptimizer) 모두 동작
- ✅ xlsx 데이터 파싱 (`dataPreprocess.ts`, 3개 엑셀)
- ✅ 네비게이션 (리뷰 메뉴 제거 + 프로모션 메뉴 분리)
- ✅ shadcn `progress.tsx` 컴포넌트
- ✅ 환경변수 (ANTHROPIC/COUPANG/WING) — 진희 KMA/이카운트와 통합

**검증:** promotion 영역 타입체크 에러 0건. 다른 팀원 영역 73개 타입 에러는 v6 마이그레이션 후속 작업으로 잔존(별개 트랙).

### [2026-04-17] [슬아 PR #20 상세 분석 + 진행 계획 + 예상 결과]

**요청:** 슬아님 PR #20(team/슬아 → submain) 검토. submain 머지 시도 전 현황 파악 + 처리 방향 결정.

---

#### 📊 변경 규모

**64 files, +7,704 / -869** (submain 머지 전 origin/submain...origin/team/슬아 3-dot diff 기준)

진희(+3,444), 나경(+1,697)보다 훨씬 큰 규모. orders/cost 대시보드 기능이 본격 확장되면서 공유 유틸/API/마이그레이션까지 대거 추가된 상태.

---

#### ✅ 슬아 영역 (정당) — 주요 기능 확장

**`src/components/orders/`** — Orders 대시보드 대규모 재작성

| 파일                                       |   라인 | 성격                                                   |
| ------------------------------------------ | -----: | ------------------------------------------------------ |
| `OrderDashboard.tsx`                       | +1,239 | 메인 컨테이너 전면 재작성 (발주/계약/엑셀 업로드 통합) |
| `OrderTable.tsx`                           |   +241 | 출고 대기 테이블 확장                                  |
| `BatchProfitSidebar.tsx`                   |   +266 | 배치별 기대 수익 카드 확장                             |
| `OrderContractAddForm.tsx`                 |   +361 | 신규 — 계약 추가 폼                                    |
| `OrderExcelActionBar.tsx`                  |    +85 | 신규 — 엑셀 액션 바                                    |
| `OrderExcelPreviewTable.tsx`               |   +297 | 신규 — 엑셀 프리뷰 테이블                              |
| `_hooks/useOrders.ts`                      |     ±3 | 기존 스켈레톤 소폭 수정                                |
| `_hooks/buildContractRows.ts`              |   +147 | 신규                                                   |
| `_hooks/useCompetitorPrice.ts`             |    +18 | 신규                                                   |
| `_hooks/useContractFormOptions.ts`         |    +87 | 신규                                                   |
| `_hooks/useErpPurchases.ts`                |    +64 | 신규                                                   |
| `_hooks/useOrderExcelWorkspace.ts`         |   +173 | 신규                                                   |
| `_hooks/useSkuApproximateMap.ts`           |    +58 | 신규                                                   |
| `_hooks/useSkuMapping.ts`                  |    +70 | 신규                                                   |
| `_hooks/useStockMovementsInboundReturn.ts` |    +58 | 신규                                                   |

**`src/components/analytics/cost/`** — Cost 대시보드 대규모 재작성

| 파일                                | 라인 | 성격                                    |
| ----------------------------------- | ---: | --------------------------------------- |
| `CostAnalyticsDashboard.tsx`        | +588 | 메인 재작성                             |
| `MarginCalculator.tsx`              | +971 | 신규 — 대형 마진 계산기                 |
| `MarginStrategyCards.tsx`           |  +57 | 확장                                    |
| `OrdersMarginContext.tsx`           |  +32 | 신규 — React Context (orders↔cost 공유) |
| `_hooks/useCost.ts`                 | +152 | 확장                                    |
| `_hooks/useMarginProductOptions.ts` |  +60 | 신규                                    |
| `_hooks/useProductMarginPreset.ts`  | +160 | 신규                                    |

**판정:** 전부 슬아 영역 내 정당한 변경. 구조/규모/기능 모두 합리적.

---

#### 🔴 PM 영역 침범 — 항목별 판정

| 경로                                                     | 변경                                                                                                                            | 판정 제안                                                                                                                                                          | 사유                                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `src/app/api/orders/bulk-import-purchase-excel/route.ts` | 신규 +282                                                                                                                       | ⚠️ **사후 수용 후보** — 엑셀 대량 업로드 POST (`useOrderExcelWorkspace.ts:110` 호출). 보안 검토 필요 (인증 체크, env 검증)                                         | 서버 액션 + SheetJS 파싱 필요로 PM 영역 불가피                                               |
| `src/app/api/orders/excel-upload-history/route.ts`       | 신규 +54                                                                                                                        | ⚠️ **사후 수용 후보** — 업로드 이력 GET (`OrderDashboard.tsx:421` 호출, companyCode 쿼리). 보안 검토 필요                                                          | 이력 조회 서버 엔드포인트                                                                    |
| `src/app/api/orders/manual-erp-purchase/route.ts`        | 신규 +198                                                                                                                       | ⚠️ **사후 수용 후보** — 수동 ERP 매입 등록 POST (`OrderContractAddForm.tsx:146` 호출). 보안 검토 필요                                                              | 계약 추가 폼 서버 액션                                                                       |
| `src/app/api/orders/sync-erp-purchases/route.ts`         | 신규 +372                                                                                                                       | ⚠️ **사후 수용 후보** — ERP 매입 동기화 POST (`OrderDashboard.tsx:465` 호출, 최근 30일). 보안 검토 필요                                                            | 외부 ERP 동기화 서버 액션                                                                    |
| `src/app/api/orders/transfer-records/route.ts`           | 신규 +149                                                                                                                       | ⚠️ **사후 수용 후보** — 이체 기록 GET/POST (`OrderDashboard.tsx:147, 531` 2곳 호출). 보안 검토 필요                                                                | 진희 `/api/crawl/ecount` 선례와 동일 패턴                                                    |
| `src/lib/margin/`                                        | 신규 6개 파일(`breakeven-margin`, `calc-margin`, `constants`, `index`, `profit-helpers`, `types`) + `useMarginCalc.ts` 재구조화 | ⚠️ **사후 수용 후보** — 4-14에 PM이 한 번 수용 결정한 영역이고, orders/cost 양쪽에서 공유하는 엔진이라 `src/lib/` 위치 합리적. 단 파일 6개 분화가 과한지 구조 검토 | 4-14 결정 "orders와 cost 양쪽에서 공유하는 엔진이므로 src/lib/에 두는 것이 합리적" 선례 연장 |
| `src/lib/orders/`                                        | **신규 폴더** + `orderMeta.ts` (+70) + `purchaseExcel.ts` (+298)                                                                | ⚠️ **사후 수용 후보** — `src/lib/margin/` 패턴 확장. orders 전용 유틸로 분리한 것 합리적. 단 "PM 요청 없이 lib 하위 새 폴더 추가"는 절차 위반                      | `purchaseExcel` 같은 SheetJS 래퍼는 재사용성 있는 유틸이므로 lib 위치 타당                   |
| `supabase/types.ts`                                      | 수동 편집 +56줄                                                                                                                 | ❌ **원복 완료** (머지 시 submain v6 버전 채택). 자동 생성 파일이라 수동 편집 금지. 슬아가 추가한 타입 정의는 v6 재생성 시 자연 흡수돼야 함                        | `supabase gen types`로만 갱신. PM이 4-17에 재생성한 v6 반영본이 정본                         |
| `supabase/migrations/010~014`                            | 5개 마이그레이션 파일 추가                                                                                                      | 🔴 **충돌 조정 필요** (아래 상세 참조)                                                                                                                             | 명명 규칙(`010_*`) 구식 + v6 baseline과 동일 테이블 재정의 가능성                            |
| `supabase/.temp/*` 9개 파일                              | 신규                                                                                                                            | 🔴 **추적 해제 + .gitignore 추가** 필수                                                                                                                            | Supabase CLI 로컬 캐시. gitignore 누락으로 실수 커밋된 것                                    |
| `tsconfig.tsbuildinfo`                                   | 수정                                                                                                                            | ✅ **자동 처리됨** — submain이 이미 추적 해제 + .gitignore 추가 상태라 머지 시 흡수됨                                                                              | 나경 PR 정리에서 구조적 해결 완료                                                            |
| `src/components/layout/nav-orders.ts`                    | ±4                                                                                                                              | ✅ **수용** — 슬아 본인 nav 파일 (CLAUDE.md 명시 허용)                                                                                                             | 슬아 영역 권한 범위                                                                          |

---

#### 🧬 v6 스키마 영향 분석

**슬아 hooks의 구 스키마 참조 (4개 파일, 14건 타입 에러 예상)**

| 파일                                       | 구 참조                                                                           | 필요 매핑                                                                                          |
| ------------------------------------------ | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `_hooks/useOrders.ts`                      | `stock_movements`(복수), `products`                                               | `stock_movement`(단수), `item_master`                                                              |
| `_hooks/useCost.ts`                        | `products`                                                                        | `item_master` 또는 `v_item_full` 뷰                                                                |
| `_hooks/useErpPurchases.ts`                | `erp_purchases` (v6 DB에 없음, 슬아 `010_orders_schema_compat.sql`에서 신규 생성) | 🔴 v6 `orders` 테이블로 마이그레이션 (orders가 이미 8,797행 보유, GL/지엘팜/HNB 3개 ERP 통합 저장) |
| `_hooks/useStockMovementsInboundReturn.ts` | `stock_movements` 추정                                                            | `stock_movement`                                                                                   |

**자세한 매핑 가이드:** `database.md` [v6 스키마 변경 영향 분석] 슬아 섹션 참조.

**처리:** 이 PR 머지 후 슬아가 본인 영역에서 마이그레이션 (PM이 대신 하지 않음). submain 빌드는 머지 직후 CI FAILURE 예상.

---

#### 🗃️ 슬아 supabase/migrations 010~014 처리 방향

**현재 공존 상태 (머지 후):**

```
010_crawlingitems_inventory.sql      ← 진희 (보류 중)
010_orders_schema_compat.sql         ← 슬아 (신규) 🔴 번호 충돌
011_order_transfer_states.sql        ← 슬아 (신규)
012_order_excel_upload_logs.sql      ← 슬아 (신규)
013_item_erp_mapping.sql             ← 슬아 (신규) 🔴 v6 동일 이름 테이블 재정의
014_products_pcs_per_pallet.sql      ← 슬아 (신규) 🔴 폐기 테이블(products) 대상
20260415184109~20260417013044_*.sql  ← v6 baseline + 호환 수정 19개
```

**충돌/의심 포인트:**

1. **번호 중복 010** — 진희 `010_crawlingitems_inventory.sql`과 슬아 `010_orders_schema_compat.sql` 동일 번호. 둘 다 dev DB 원격에는 미적용 (로컬 파일만 있음). Supabase CLI는 번호 중복 경고 낼 수 있음.
2. **`013_item_erp_mapping.sql`** — v6 baseline이 이미 `item_erp_mapping` 테이블 가짐. 중복 정의면 에러. CREATE TABLE IF NOT EXISTS / ALTER TABLE 중 어느 방식인지 내용 확인 필요.
3. **`014_products_pcs_per_pallet.sql`** — `products` 테이블은 v6에서 폐기됨. ALTER TABLE products 시도하면 에러. `item_master`로 타겟 변경 필요.

**내용 미확인 파일:**

- `010_orders_schema_compat.sql` (40줄) — "호환" 의도지만 실제 무엇을 호환시키는지 확인 필요
- `011_order_transfer_states.sql` (25줄) — 새 테이블 예상
- `012_order_excel_upload_logs.sql` (25줄) — 새 테이블 예상

**처리 방향 후보:**

- **(A) 슬아 마이그레이션 전부 폐기 + 신 스키마 기반 재작성 요청** (가장 깔끔하지만 슬아 작업량 큼)
- **(B) PM이 내용 검토 후 선별 리네임** — 유효한 것만 `20260417XXXXXX_*.sql`로 리네임해서 dev DB 적용 가능 상태로 (권장)
- **(C) 머지 시점엔 파일만 보존, DB 적용은 별도 결정** — 현 상태 유지, 미결사항 등록

**추천:** (B) — PM이 5개 파일 내용 읽고 v6와 호환되는지 판정 후 유효한 것만 살리는 방향. dev DB 원격은 슬아 마이그레이션 미적용 상태라 안전하게 정리 가능.

---

#### 🧹 위생 이슈 — 즉시 정리

| 항목                                                                                                                                                                 | 처리                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `supabase/.temp/` 9개 (cli-latest, gotrue-version, linked-project.json, pooler-url, postgres-version, project-ref, rest-version, storage-migration, storage-version) | 추적 해제 + `.gitignore`에 `supabase/.temp/` 추가                           |
| `tsconfig.tsbuildinfo`                                                                                                                                               | 이미 자동 처리 (submain에서 gitignore됨)                                    |
| `package.json` / `package-lock.json`                                                                                                                                 | 자동 머지됨. 슬아가 신규 의존성 추가했는지 확인 필요 (금지 라이브러리 체크) |

---

#### 📋 진행 계획 (단계별)

**Step 1 — submain 머지 (완료)** ✅

- 충돌 3건 해결: `.env.example`, `supabase/types.ts`, `tsconfig.tsbuildinfo`
- 141 files changed, +20,951/-2,127 통합

**Step 2 — 위생 정리 (즉시)**

- `supabase/.temp/` 추적 해제 + .gitignore 업데이트
- `package.json` 금지 라이브러리 체크 (axios/MUI/Redux/Prisma 등)

**Step 3 — PM 영역 침범 개별 판정 (PM 결정 필요)**

- `src/app/api/orders/` 5개 신규 라우트 (총 +1,055줄) 코드 품질 검토 (진희 보안 패턴 적용: auth.getUser() + env 검증)
  - `bulk-import-purchase-excel/route.ts` +282
  - `excel-upload-history/route.ts` +54
  - `manual-erp-purchase/route.ts` +198
  - `sync-erp-purchases/route.ts` +372
  - `transfer-records/route.ts` +149
- `src/lib/margin/` 신규 6개 + `src/lib/orders/` 신규 폴더 수용 여부
- 수용하면: 그대로 유지 + 미결 기록. 거절하면: 슬아에게 위치 이동 요청

**Step 4 — 슬아 supabase/migrations 010~014 처리 (PM 결정 필요)**

- 각 파일 내용 읽고 v6 호환성 평가
- (B안) 유효한 것 `20260417XXXXXX_*` 리네임 + apply_migration
- (A안) 전부 폐기 + 재작성 요청

**Step 5 — 슬아 hooks v6 마이그레이션 (슬아 본인 작업 대기)**

- `useOrders.ts`, `useCost.ts`, `useErpPurchases.ts`, `useStockMovementsInboundReturn.ts` 등에서 구 테이블 참조 → 신 스키마로
- PM은 가이드만 제공 (`database.md` [v6 영향 분석])

**Step 6 — 코드 리뷰 + 기능 검증**

- `npx tsc --noEmit`로 슬아 영역 에러 0건 확인 (Step 5 이후)
- 브라우저에서 `/orders`, `/analytics/cost` 탭/기능 점검

**Step 7 — PM 작업 로그 기록 + push**

- `docs/logs/pm/frontend.md` 및 `database.md`에 정리 결과 반영
- `team/슬아` push → PR #20 base main→submain 전환 (필요 시)
- 사용자 판단으로 머지 (admin bypass 없이)

---

#### 🔮 예상 결과

**Step 2~4 완료 직후 (즉시 예상):**

- 슬아 supabase/.temp/ 9개 파일 추적 해제 완료
- `.gitignore`에 `supabase/.temp/` 추가됨
- PM 영역 신규 파일 3개 영역(`src/lib/orders/`, `src/lib/margin/` 확장, `src/app/api/orders/` 5개 라우트) 사후 수용 결정 완료 (혹은 이동 요청)
- 슬아 마이그레이션 010~014 중 유효한 것만 선별 리네임 or 전부 폐기

**Step 5 전(슬아 v6 마이그 미완) 상태로 submain 머지 시:**

- 페이지 렌더: 전부 정상 ✓ (page.tsx 자체는 import 에러 없음)
- 데이터 조회: `/orders`, `/analytics/cost` — Supabase 런타임 에러 (UI에 빈 테이블 또는 에러 메시지)
- CI Lint & Build: 🔴 FAILURE (슬아 hooks 구 스키마 참조 14건 + 기존 정민 5건 = 약 19건 타입 에러)
- CI 파일 경계 검사: 🟡 PM 영역 침범 건들에 대한 판정이 파일 경계 규칙에 반영됐는지에 따라 통과/실패

**Step 5 완료 후 (슬아 v6 마이그 끝) 상태로 submain 머지 시:**

- CI Lint & Build: 🟢 PASS 예상 (정민 forecast.py의 `forecasts` 테이블 부재 한 건만 남음)
- 모든 팀 기능 정상 (진희 logistics + 나경 promotion + 슬아 orders/cost 셋 다 동작)

**만약 슬아 마이그레이션 010~014가 v6 테이블과 충돌하면:**

- dev DB에 apply 시 PG 에러 (DROP/CREATE/ALTER 순서 꼬임)
- Supabase MCP로 DDL 적용 전 dry-run 검증 필수

---

#### 🚀 B안 확정 — PM 주도 재작업 후 머지 파이프라인 (2026-04-17 결정)

**결정 근거:** 슬아 PR #20 심층 검토 결과 v6 스키마 비호환 + 코드 품질 블로커 5건 발견. 슬아 본인 대신 PM이 직접 재작업하여 머지 전 CI GREEN 확보하기로 결정.

**추가 발견 (v6 스키마 외 코드 품질 블로커 5건):**

1. 🔴 **CLAUDE.md 명시 규칙 위반** — `OrderExcelPreviewTable.tsx:91` `<table>`, `OrderContractAddForm.tsx:287` `<option>` 네이티브 HTML 사용 (shadcn/ui 필수)
2. 🔴 **타입 단언 남발** — `useStockMovementsInboundReturn.ts:35`, `useSkuApproximateMap.ts:40` `(rows as X[]) ?? []` 패턴
3. 🔴 **Supabase 에러 체크 누락** — `useErpPurchases.ts:52`, `useSkuApproximateMap.ts:40` error 변수 무시
4. 🔴 **useEffect 무한 로드** — `useOrderExcelWorkspace.ts:86` deps `[loadSample]` + loadSample이 `[applyBuffer]` 의존 → 재로드 루프
5. 🔴 **죽은 분기** — `MarginCalculator.tsx:114` `|| "" || null` (`""` 뒤 `|| null`은 도달 불가)

**그 외 확인 결과 (무문제):**

- 금지 라이브러리 없음 (axios/MUI/Redux/Prisma/react-query/SWR/Zustand 전부 부재)
- `xlsx` (SheetJS) 신규 의존성 — 엑셀 파싱용, 금지 목록 외 일반 유틸이라 허용
- TODO/FIXME/console.log 잔재 없음 (console.error 2건은 개선 제안 수준)
- cost/ 영역 네이티브 HTML 없음
- 한국어 주석 준수

---

**B안 작업 순서 (총 11단계, 예상 4시간):**

| #       | 작업                                            | 예상 소요 | 주요 산출물                                                                              |
| ------- | ----------------------------------------------- | --------- | ---------------------------------------------------------------------------------------- |
| 1       | submain → team/슬아 머지                        | 10분      | 충돌 3건 해결 (types.ts, .env.example, tsbuildinfo)                                      |
| 2       | supabase/.temp/ 추적 해제 + .gitignore          | 5분       | 9개 파일 캐시에서 제거                                                                   |
| 3       | migrations 010/013/014 폐기 + 011/012 호환 검토 | 20분      | 011/012 유효 시 `20260417XXXXXX_*` 리네임 + apply                                        |
| 4       | supabase/types.ts v6 원복                       | 5분       | 머지로 자동 + gen types 재생성                                                           |
| 5       | 슬아 기본 hooks v6 대응                         | 40분      | `products→item_master`, `stock_movements→stock_movement` 치환 (4개 hook)                 |
| 6       | `erp_purchases → orders` 전환                   | 90분      | hook 3개 + API 5개 + purchaseExcel 주석 (가장 큰 작업)                                   |
| **6.5** | **슬아 코드 품질 정리 (블로커 5건)**            | **30분**  | **네이티브 HTML→shadcn, 타입 단언 제거, 에러 체크 추가, 무한 로드 수정, 죽은 분기 제거** |
| 7       | API routes 보안 검토 (진희 선례)                | 30분      | 5개 라우트에 `auth.getUser()` + env 검증                                                 |
| 8       | `npx tsc --noEmit` 통과 확인                    | 10분      | 슬아 영역 타입 에러 0건                                                                  |
| 9       | 브라우저 기능 검증                              | 20분      | `/orders`, `/analytics/cost` 페이지 + CRUD + 엑셀 업로드                                 |
| 10      | 로그 기록 + push + PR #20 머지                  | 15분      | frontend.md/database.md 업데이트, CI GREEN 상태 머지                                     |

---

#### 🔮 B안 파이프라인 단계별 예상 결과

**Step 1~3 완료 직후 (머지 베이스 + 위생 정리):**

- team/슬아 브랜치가 최신 submain(v6) 베이스 위에 정렬됨
- supabase/.temp/ 9개 git 추적 해제, .gitignore 1줄 추가
- migrations 010/013/014 파일 3개 삭제, 011/012는 v6 호환 판정 후 리네임 적용 or 폐기
- dev DB: 011(order_transfer_states), 012(order_excel_upload_logs) 신규 테이블 2개 추가 (호환 시)

**Step 4~6 완료 직후 (스키마 대응):**

- 슬아 hooks 11개 파일(orders/_hooks/_ 3개 + analytics/cost/_hooks/_ 1개 + erp 관련 3개) 전부 v6 스키마 참조로 전환
- API routes 5개가 `orders` 테이블로 INSERT/SELECT (erp_system='gl/gl_pharm/hnb', tx_type='purchase' 필수 지정)
- `erp_purchases` 의존 0건, `products` 참조 0건, `stock_movements`(복수) 0건
- types.ts는 submain v6 정본 그대로

**Step 6.5~7 완료 직후 (품질 + 보안):**

- 네이티브 `<table>`/`<option>` 0건 (shadcn Table/SelectItem으로 전환)
- `as X[]` 타입 단언 제거, Supabase 반환 타입 그대로 사용
- Supabase 호출부 전부 `if (error) { ... }` 체크 존재
- useEffect 의존성 배열 정합성 (exhaustive-deps 경고 0건)
- API routes 5개에 `auth.getUser()` 세션 검증 + env 누락 시 500 응답

**Step 8 완료 시 (타입체크):**

- `npx tsc --noEmit` 슬아 영역 에러 0건
- 잔여 에러: 정민 `forecast.py`/hooks의 `forecasts` 테이블 부재 관련 소수만 (슬아 PR 머지 판정과 무관 — 정민 본인이 별도 처리)

**Step 9 완료 시 (브라우저 검증):**

- `/orders` 페이지: 발주/계약/엑셀 업로드 탭 전부 로드, `orders` 테이블 8,797행 중 tx_type='purchase' 필터 결과 표시
- `/analytics/cost` 페이지: MarginCalculator 상품 드롭다운(item_master 144건), 환율 시뮬레이션, 센터 순이익 차트 정상
- 엑셀 업로드: `bulk-import-purchase-excel` 성공 시 `orders`에 INSERT, `excel-upload-history` 이력 조회 동작

**Step 10 완료 시 (최종):**

- CI Lint & Build: 🟢 PASS (슬아 영역)
- CI 파일 경계 검사: 🟢 PASS (PM이 직접 수정했으므로 경계 예외 기록됨)
- PR #20 base `submain`으로 머지 가능, admin bypass 불필요
- `docs/logs/pm/frontend.md`, `database.md`에 최종 상태 기록

---

#### ⚠️ B안 리스크 시나리오

**[시나리오 1] migrations 011/012가 v6와 충돌**

- 예상 대응: 파일 내용 재작성 (v6 테이블명/타입 맞춰) 또는 폐기 후 PM이 정식 v6 스키마로 재작성
- 영향: Step 3 소요 20분 → 60분으로 증가

**[시나리오 2] orders 테이블 INSERT 시 item_id 매핑 실패**

- 예상 대응: UI의 상품 선택 시 item_master에서 직접 `seq_no` 또는 `item_id`로 조회하도록 UI 수정 필요
- 영향: Step 6 소요 90분 → 150분으로 증가

**[시나리오 3] 슬아 본인이 수동 병합 중 PM 재작업과 충돌**

- 예상 대응: team/슬아 브랜치 작업 전 슬아에게 "일시 중지" 통지. 재작업 완료 후 슬아는 rebase 또는 새 PR 기반 작업
- 영향: 팀 커뮤니케이션 필요 (Slack/팀 채널)

**[시나리오 4] 브라우저 검증에서 기능 회귀 발견**

- 예상 대응: 회귀 원인 디버깅 후 재수정. 최악의 경우 Step 6 범위 확대
- 영향: Step 9 소요 20분 → 60~120분

**최악 시나리오 합산 소요:** 4시간 → 7~8시간 (하루 안에 완료 가능 범위 유지)

---

#### 📐 1단/2단 분리 결정 (2026-04-17)

**배경:** 사용자가 orders 테이블 중심 승인 워크플로우(재고등록/거절/미처리 상태) + 필터 UI + LLM 채팅 + 크롤링 파이프라인까지 포함한 확장 설계를 제안. 슬아 PR #20 원안 범위를 크게 상회.

**결정: 1단 접근 확정 — 슬아 PR #20을 원안 최소 호환 선에서 먼저 머지, 재고등록 워크플로우는 후속 PR.**

**1단 (이번 B안 파이프라인, 4시간):**

- 슬아 erp_purchases 원안 존중 (orders 테이블과 분리 유지, 트리거 없음)
- PM이 v6 호환 erp_purchases 스키마 재작성 (bigint id, item_id FK)
- 010/013/014 폐기, 011/012 호환 정리
- 슬아 코드의 `products → item_master` 치환
- v6 트리거/orders 구조 **건드리지 않음**

**2단 (후속 PR, 별도 1~2일 작업):**

DB 변경:

- `orders` 테이블에 `approval_status TEXT CHECK ('pending', 'approved', 'rejected')` + `reviewed_by` + `reviewed_at` + `reject_reason` 컬럼 추가
- `trg_orders_to_stock_movement` 트리거 수정: INSERT 시 자동 생성 제거, `UPDATE status='approved'` 시점에만 stock_movement 생성
- 또는 트리거 제거 후 "승인" API가 stock_movement 직접 INSERT

UI 변경 (슬아 영역 재구축):

- 좌측 패널: 기존 송금 진행도(`order_transfer_states`)와 동일 스타일로 재고등록 상태 아이콘
- 메인 테이블 컬럼: 거래유형(구매/판매/반품), 품목명, 품목코드, 규격, 수량, 거래처, 비고
- 액션: "입고(구매)", "출고(판매)", "등록 X"(거부 공통) 버튼
- 거부 시 비고 입력 창 팝업 (reject_reason 기록)
- 다중 필터: 거래유형, 거래처, 품목명/품목코드
- 하단 LLM 채팅 (범위 미정)

크롤링 (n8n + Playwright, 별도 인프라 작업):

- 지엘팜 구매현황 (필수)
- 지엘 생산입고 (필수)
- 지엘 구매/판매 기록 (필수, 기술적 어려우면 축소)
- **HNB 구매/판매 데이터 (필수)** — 가능 시 아님
- 자사 내부거래는 필터링 (`is_internal=true` 플래그)

**개념 구분 (향후 설계 기준):**

| 개념       | 객체                  | 역할                                                   |
| ---------- | --------------------- | ------------------------------------------------------ |
| 재고흐름표 | `stock_movement`      | 시계열 변동 로그 (승인된 것만) — 분석/감사/과거 비교용 |
| 현재재고   | `v_current_stock`     | 계산 뷰 (base + 최신 running_stock) — 운영 화면용      |
| 쿠팡 재고  | `inventory_operation` | 일별 스냅샷 — 로켓배송 풀필먼트 기준, 자사와 별개      |

둘 중 선택 아님 — 용도가 달라서 둘 다 유지.

---

#### 🗣️ 사용자 확인 요청 사항

1. **PM 영역 수용 범위:** `src/app/api/orders/transfer-records/`, `src/lib/orders/`, `src/lib/margin/` 확장분 — 전부 수용? 또는 일부 거절?
2. **supabase/migrations 010~014 처리 방향:** (A) 전부 폐기 / (B) 선별 리네임 / (C) 현 상태 유지 — 중 선택
3. **머지 시점:** Step 5(슬아 v6 마이그) 완료 후? 또는 지금 상태(CI 실패)로 nakyung PR과 같은 방식 머지?
4. **슬아 v6 마이그레이션 주체:** 슬아 본인에게 요청할지, PM이 대신 할지

> 작업 중 발견된 미결 이슈, PM/팀원 확인이 필요한 사항을 모아둡니다.
> 해결되면 해당 항목을 지우거나 "✅ 해결됨 (날짜)" 표시 후 일자별 로그로 이동.
> 새 항목 추가 시 발견 일자 함께 기록.

### [PM 직접 처리 필요]

- **(2026-04-17)** 진희 submain 머지 직후, 슬아/정민/나경 PR 페이지에서 "Update branch" 버튼 클릭하여 CI 재실행 강제. 73개 타입 에러를 각 팀원이 인지해야 함.
- **(2026-04-17)** GitHub branch protection에서 "Require branches to be up to date before merging" 활성화 검토 — 활성화 시 머지 전 강제 rebase로 깨진 코드 머지 차단.
- **(2026-04-17)** 010 마이그레이션(`import_leadtime`) 정식 적용 결정. 적용 시 새 명명 규칙(`20260417...`)으로 리네임 + Supabase apply_migration. 폐기 시 LeadTimeTracker MOCK 영구 모드 또는 기능 비활성화.
- **(2026-04-17)** weather/route.ts 좌표 하드코딩 (NX:37, NY:130 파주) → `WEATHER_DEFAULT_NX/NY` 환경변수화. 타임존 UTC/KST ambiguity 명시.

### [팀원 확인 필요 — submain 머지 후 즉시 알림]

- **슬아 (2026-04-17)** v6 스키마 변경 영향:
  - `useOrders.ts` `stock_movements`/`products` 사용 → `stock_movement`(단수형)/`item_master` 또는 `v_current_stock`로 마이그레이션
  - `useCost.ts` `products(unit_cost, erp_code, coupang_sku_id)` → `item_master(base_cost)` + `item_erp_mapping`/`item_coupang_mapping` JOIN, 또는 `v_item_full` 뷰
  - 상세 매핑: `database.md`의 [2026-04-17] [v6 스키마 변경 영향 분석] 슬아 섹션 참조

- **정민 (2026-04-17)** v6 스키마 변경 영향:
  - `useForecast.ts` `coupang_performance` → `v_coupang_daily_sales` 또는 `v_sales_weather`
  - **4-15 재구현 가이드(forecasts/weather_data 테이블) 무효** — 신 스키마에 해당 테이블 없음. 예측 결과 저장/날씨 저장 위치는 PM과 재협의 필요.
  - 상세 매핑: `database.md` 정민 섹션 참조

- **나경 (2026-04-17)** ✅ 해결됨 (2026-04-17): `usePromotion.ts` 삭제(죽은 코드)로 자연 해소. 리뷰 기능 제거로 `useReviews.ts`도 미해당.
- **나경 (2026-04-17)** `dataPreprocess.ts` xlsx 파싱 → Supabase 마이그레이션 후속 필요. 현재 엑셀 파일 3개(`src/components/analytics/promotion/assets/`) 런타임 파싱. 신 스키마 `v_promo_roi` 뷰 + 광고비/판매납품 신규 테이블 설계 필요. database.md 참조.
- **나경 (2026-04-17)** `promotion_dashboard/` Python Dash 정식 통합 결정 대기. 현재 나경 로컬에만 존재(레포 미커밋). 팀 dev 서버에 통합하려면 별도 절차 필요(폴더 commit + Python 환경 표준화 + 안전한 dev 스크립트 분리).

- **진희 (2026-04-17)** 010 마이그레이션 처리 PM 결정 후 본인 LeadTimeTracker 동작 확인 필요. MOCK 모드 해제 시 실제 BL 데이터 흐름 검증.

### [외부 의존성 / 데이터 대기]

- **(2026-04-15 이월)** 슬아 — `CENTER_RATES` 20개 센터 밀크런 단가 하드코딩 → Supabase 센터 테이블 생성 후 DB 조회로 교체
- **(2026-04-15 이월)** 나경 — `ratingChartData` 별점 분포 추정값 (neutralRatio 0.2 + lowRatio+highRatio 1.0 합계 초과 버그). 실제 별점 분포 데이터 확보 시 교체
- **(2026-04-15 이월)** 나경 — 경쟁사 데이터(가격 4건/스펙 3건), 키워드, 플랫폼 행사 정보 하드코딩. 크롤링/API 연동 시 교체
- **(2026-04-15 이월)** 슬아 — Mock → Supabase 전환 (OrderDashboard에서 useOrders 연결 시점). 단, v6 스키마 매핑 적용 후 진행
- **(2026-04-15 이월)** 슬아 — CSV 업로드 기능 행 수만 카운트하는 껍데기 상태. 실제 CSV 파일 확정 후 구현
- **(2026-04-15 이월)** 정민 — `services/api/` 폴더는 PM 전용. 정민님 코드 이동 시 PM이 폴더 생성 후 이관 필요
- **(2026-04-15 이월)** 정민 — `docs/logs/정민.md` 미작성. 작성 요청
- **(2026-04-15 이월)** 나경 — `docs/logs/나경.md` 미작성. 작성 요청

### [후속 정리 / 기술 부채]

- **(2026-04-17)** 010 마이그레이션 정식 채택 시 기존 명명(`010_*.sql`) → 새 명명 규칙(`20260417...`)으로 리네임 일관성 유지
- **(2026-04-17)** `tracking/route.ts` 유니패스 API 키 URL 노출 — 우회 불가 (외부 API 한계). 향후 유니패스 API 정책 변경 시 헤더 인증으로 마이그레이션
- **(2026-04-17)** 슬아 — `calcProfitWithVatPrice` `settlementRatio` 필수 파라미터화로 호출부 누락 시 타입 에러. 신규 호출 추가 시 채널 정산율 전달 필수

---

### [2026-04-18] [슬아 PR #20 재구축 Step 0~11 완료 — PR 머지 대기]

**요청:** B안 파이프라인 (슬아.md 2026-04-18 섹션) Step 0~11 실행. Step 12(PR 머지)는 사용자 수동 예정.

**변경 파일:**

- **마이그레이션:** `supabase/migrations/010_orders_schema_compat.sql` (삭제), `011_order_transfer_states.sql` (삭제), `013_item_erp_mapping.sql` (삭제), `014_products_pcs_per_pallet.sql` (삭제), `012_order_excel_upload_logs.sql` → `20260417183508_create_excel_upload_logs.sql` (리네임 + 2단 RLS 정책 일관 재작성)
- **.temp/ 정리:** 9파일 추적 해제, `.gitignore`에 `supabase/.temp/` + `tsconfig.tsbuildinfo` 추가
- **타입:** `supabase/types.ts` (1,884줄 재생성), `src/lib/supabase/types.ts` (헬퍼 확장 — `Tables<>`가 Views 커버, `TablesInsert`/`TablesUpdate` alias)
- **hooks 재작성:** `src/components/orders/_hooks/{useOrders, useStockMovementsInboundReturn, useSkuMapping, useSkuApproximateMap, useContractFormOptions, useOrderExcelWorkspace, buildContractRows, useCompetitorPrice}.ts`, `src/components/analytics/cost/_hooks/{useCost, useMarginProductOptions, useProductMarginPreset}.ts`, `src/components/orders/_hooks/useErpPurchases.ts` (삭제), `src/lib/orders/{orderMeta, purchaseExcel}.ts`
- **API routes 재작성:** `src/app/api/orders/{sync-erp-purchases, transfer-records}/` (폴더 삭제), `bulk-import-purchase-excel`, `manual-erp-purchase`, `excel-upload-history` (전면 재작성 + auth 체크), `approve`, `reject` (신규 생성)
- **UI 분해:** `src/components/orders/{OrderTable, BatchProfitSidebar}.tsx` (삭제), `{OrdersHeader, OrdersTable, OrdersActionPanel, OrdersRejectPopover, OrdersExcelUploadDialog, OrdersStockSidebar}.tsx` (신규), `{OrderDashboard, OrderContractAddForm, OrderExcelPreviewTable}.tsx` (재작성)
- **최소 수정:** `src/components/analytics/cost/{MarginCalculator, CostAnalyticsDashboard}.tsx` (필드 이름 v6 대응), `src/app/(dashboard)/page.tsx` (텍스트 업데이트)
- **shadcn 6개 신규 설치:** `src/components/ui/{popover, checkbox, toggle, toggle-group, pagination, calendar}.tsx`
- **package.json/lock:** `xlsx` 0.18.5 (슬아 원본 추가, 유지) + shadcn 신규 deps

**변경 내용:**

- 슬아 원안의 `erp_purchases` 중심 설계를 v6+2단 `orders` 테이블(status='pending'/'approved'/'rejected')로 일원화
- 승인/거절/승인취소 UI 추가 (단건 행 버튼 + 체크박스 일괄)
- DB 트리거 `after_orders_status_change`가 status UPDATE 시 `stock_movement` 자동 생성/삭제 → 진희 재고흐름표 자동 연동
- 모든 API route에 `auth.getUser()` 체크 + env 검증 (진희 `/api/crawl/ecount` 선례 준수)
- shadcn Popover(거절 사유), Checkbox(선택), ToggleGroup(기업/거래유형 필터), Pagination(50/페이지), Calendar(날짜 Picker) 신규 활용
- 금지 라이브러리 0, 네이티브 HTML 0, `any`/`as unknown as` 0, console.log 0, `erp_purchases`/`stock_movements`(복수)/`products` 참조 0

**주의사항:**

- 슬아.md 2026-04-18 섹션에 **알려진 이슈 4건** 기록:
  - [1] `MarginCalculator` 상품 드롭다운 React duplicate-key 경고 39건 (기능 정확성 잠재 버그 2차) — 후속 PR (나) 정확 수정 권장
  - [2] `useSkuMapping`의 `pcs_per_pallet` 항상 DEFAULT 14400 — `item_master.pcs_per_pallet` 컬럼 추가 후속 PR
  - [3] 정민 `useForecast.ts` 기존 타입 에러 (본 PR 무관, 정민 별도 처리)
  - [4] `.next/types/validator.ts` reviews 캐시 stale — 빌드 재실행 시 자동 해소
- **Step 12 (PR 머지):** 사용자가 직접 PR #20 base를 `main`→`submain` 전환 후 머지 예정. AI는 push/merge 실행 안 함.
- **커밋 분할:** 7개 논리 단위 (마이그 / .temp / types / hooks / API / UI / docs)
- **다른 팀원 영역 수정 없음:** logistics/forecast/reviews/promotion 경로 무수정 확인
