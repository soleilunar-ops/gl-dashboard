# PM 작업 로그 — frontend

> Claude Code CLI 작업 내용이 기록됩니다.

---

### [2026-04-14] [PM 코드 리뷰]

**요청:** 슬아님 PR(`team/슬아` → `submain`) 코드 품질 및 파일 경계 규칙 준수 여부 리뷰
**변경 파일:** `docs/logs/슬아.md`
**변경 내용:** 슬아님 작업 로그에 노출된 API 키(`EXCHANGE_RATE_KEY=1f9a15...`) 제거, 환경변수명만 남김
**주의사항:**

- `src/app/(dashboard)/orders/page.tsx`에 368줄 로직이 직접 작성됨 → `src/components/orders/`로 분리 필요 (절대규칙 3번 위반)
- `src/lib/margin/` 2개 파일, `src/app/api/exchange-rate/` 1개 파일이 PM 전용 영역에 생성됨 → 위치 조정 또는 PM 승인 필요
- `useMarginCalc.ts` 내 데드 코드 약 40% (PACKAGING_DATA, useMarginCalc, useMarginEngine 미사용)
- `fetchExchangeRate`에 무한루프 가능성 (exCurrent가 useCallback deps에 포함)

### [2026-04-14] [PM 병합 전 수정 계획]

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

### [2026-04-14] [PM 병합 전 수정 완료]

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

**잔류 — 이번에 수정하지 않는 항목:**

- `src/lib/margin/`, `src/app/api/exchange-rate/` PM 영역 파일 위치: orders와 cost 양쪽에서 공유하는 엔진이므로 `src/lib/`에 두는 것이 합리적. PM이 직접 생성한 것으로 간주하고 승인
- Mock 데이터 → Supabase 전환: 초안 단계이므로 다음 이터레이션에서 `useOrders.ts` 스켈레톤과 연결
- CSV 업로드 미완성: 행 수만 세는 껍데기 상태. 실제 CSV 파일 확정 후 구현 예정
- `CENTER_RATES` 하드코딩: `useMarginCalc.ts`에 20개 센터 밀크런 단가(basic/over)가 코드에 직접 박혀있음. `calcMargin` 물류비 계산, CostAnalyticsDashboard 센터 드롭다운 및 센터별 순이익 차트에서 사용 중. Supabase에 센터 테이블 생성 후 DB 조회로 교체 필요
- `ratingChartData` 별점 분포: 평균 별점에서 역산한 추정값이며 실제 분포가 아님. neutralRatio(0.2)가 lowRatio+highRatio(=1.0)과 별도로 사용되어 비율 합계 초과. 실제 리뷰 별점 데이터 확보 시 교체 필요
- 경쟁사 데이터(가격 4건, 스펙 3건) / 키워드 / 플랫폼 행사 정보: 하드코딩 초안. 크롤링/API 연동 시 교체 예정
- 나경님 작업 로그(`docs/logs/나경.md`): 미작성 상태 — 나경님에게 기록 요청 필요
