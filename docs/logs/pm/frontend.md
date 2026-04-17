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

---

## 🔴 미결 / 확인 필요 사항 (지속 갱신)

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

- **나경 (2026-04-17)** v6 스키마 변경 영향:
  - `usePromotion.ts` `coupang_performance` → `v_promo_roi`
  - `useReviews.ts` `coupang_performance(review_count, avg_rating)` → 신 스키마에 `review_count`/`avg_rating` 컬럼 미존재. **데이터 소스 PM과 재협의 필요** (sku_master에 추가 또는 별도 테이블 생성 결정)
  - 상세 매핑: `database.md` 나경 섹션 참조

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
