# 대용량 파일 리팩토링 계획서

작성일: 2026-04-19
작성자: PM
기준 브랜치: `submain` (PR #26 머지 직후)
대상 파일: 7개 / 총 4,533 LOC
**작업 브랜치: `refactor` (신규) · PR 분할 없음 (단일 PR로 종합 제출)**

> 버전: v2 — 옵션 D(feature 폴더) 반영, 팀원 기능 커버리지 재검증 완료.

---

## 0. 목적

`src/` 하위에서 500줄 이상이면서 여러 책임이 섞인 파일들을 분해. **외부 import 경로·시그니처는 100% 유지**해서 팀원(정민·진희) 기능에 영향 zero.

### 구조 전략 — 옵션 D (feature 폴더 중심)

기존 프로젝트가 이미 feature 폴더(`analytics/cost/`, `analytics/forecast/`, `analytics/promotion/`) 관행을 가지고 있음. 이번에도 같은 패턴으로:

- **`logistics/` 가 너무 flat해졌으므로** → `leadtime/`, `coupang-sku/` 같은 feature 서브폴더 신규 도입
- **`_hooks/milkrun/` 처럼 복잡한 훅은 \_hooks 내부에 feature 서브폴더** 도입
- `analytics/cost/`, `analytics/forecast/`는 이미 feature 폴더 → 같은 레벨에 flat으로 파일 추가
- `lib/ecount/`, `lib/promotion/`, `lib/forecast/`, `lib/logistics/` 는 lib 도메인 그룹

**components/components/ 중첩 없음. `_components/`, `_dialogs/` 같은 일반형 서브폴더 도입 안 함.**

---

## 1. 대상 파일 선정

### 1.1 상위 20 라인 수 파일 (후보 풀)

| 순    | 파일                                                   | LOC     | 분류                                  |
| ----- | ------------------------------------------------------ | ------- | ------------------------------------- |
| 1     | `components/logistics/_data/dailyInventoryBase.ts`     | 995     | 데이터 상수 (분리 제외 — 목업 데이터) |
| 2     | `components/analytics/cost/MarginCalculator.tsx`       | 987     | **분리 대상**                         |
| 3     | `components/logistics/LeadTimeTracker.tsx`             | 800     | **분리 대상**                         |
| 4     | `app/api/crawl/ecount/route.ts`                        | 667     | **분리 대상**                         |
| 5     | `components/analytics/forecast/ForecastDashboard.tsx`  | 565     | **분리 대상**                         |
| 6     | `components/logistics/CoupangSkuAnalysisDialog.tsx`    | 549     | **분리 대상**                         |
| 7     | `components/analytics/promotion/dataPreprocess.ts`     | 509     | **분리 대상**                         |
| 8     | `components/logistics/_hooks/useMilkrunAllocations.ts` | 456     | **분리 대상**                         |
| 9     | `components/logistics/milkrun/MilkrunHistoryTab.tsx`   | 431     | 중간 크기 — 이후 검토                 |
| 10    | `components/logistics/_hooks/useLeadTime.ts`           | 400     | 중간 크기                             |
| 11~20 | orders, promotion 등                                   | 268~376 | 중간 크기                             |

**이번 작업 범위: 2번~8번 7개 파일 (총 4,533 LOC).**

---

## 2. 핵심 전략: "외부 시그니처 zero-change"

1. **원본 파일 위치·이름 유지** (feature 폴더로 이동하더라도 **구 경로에 브릿지 1줄 파일 유지**)
2. **내부만 쪼개서 조립형으로 교체**
3. 타입은 반드시 구 경로에서도 `export type { ... }` 명시 재노출 (tsconfig `isolatedModules: true` 대응)
4. Deep import 금지 (lib 하위 비공개 헬퍼 외부 참조 없음을 grep으로 확인 — 현재 0건)
5. Next.js 라우트 스캔 무관한 경로 (`components/` 하위)이므로 언더스코어 prefix 필수 아님

### 2.1 브릿지 파일 예시

```ts
// src/components/logistics/LeadTimeTracker.tsx (이동 후 브릿지)
export { default } from "./leadtime/LeadTimeTracker";
```

```ts
// src/components/analytics/promotion/dataPreprocess.ts (브릿지)
export * from "@/lib/promotion/types";
export { loadPromotionSalesOverlayDataset } from "@/lib/promotion/salesOverlay";
// ... 5개 load 함수 + 타입 7개 모두 재노출
```

---

## 3. 파일별 실행 계획

### 3.1 `MarginCalculator.tsx` (987 → 약 350 + 7개 파일) [슬아 영역]

#### 사전 확인

```bash
grep -rn "MarginCalculator" src/                 # 외부: CostAnalyticsDashboard 1곳
grep -rn "MarginCalculatorProps" src/            # 외부 참조 없음 (내부 타입)
grep -rn "ChannelKey" src/components/analytics/cost/  # useMarginCalc에서 import 중
```

#### 현재 외부 참조

- `components/analytics/cost/CostAnalyticsDashboard.tsx` → default import 1곳

#### 분리 구조 (flat, `analytics/cost/` 이미 feature 폴더)

| 새 파일                                                 | 책임                                                | 원본 라인 |
| ------------------------------------------------------- | --------------------------------------------------- | --------- |
| `analytics/cost/PriceInputForm.tsx`                     | 조건 입력 섹션 (상품·시장·고정)                     | 347–583   |
| `analytics/cost/KeyConclusionCard.tsx`                  | 핵심 결론 카드 + details                            | 585–653   |
| `analytics/cost/BepSummaryCard.tsx`                     | BEP 요약 카드                                       | 660–697   |
| `analytics/cost/PricingCompetitionCards.tsx`            | 전략별 권장가 + 위너 카드                           | 699–769   |
| `analytics/cost/ExchangeRiskChart.tsx`                  | 환율 민감도 AreaChart                               | 771–830   |
| `analytics/cost/CenterProfitTable.tsx`                  | 센터별 순이익 BarChart + 페이지네이션               | 832–924   |
| `analytics/cost/NumberInput.tsx`                        | `NumberInput`, `IoBlockHeader`, `OutputMetric` 공용 | 943–987   |
| `analytics/cost/MarginCalculator.tsx` (축약, 위치 유지) | Props 유지 + default export + 조립                  | —         |

#### 주의

- `MarginCalculatorProps` interface, `default` export 모두 유지
- `ChannelKey` 타입 필요 시 `useMarginCalc`에서 직접 import (재노출 불필요)

#### 검증

- `/analytics/cost`: 상품 선택 → 환율 동기화 → 각 섹션 → details 펼치기

---

### 3.2 `api/crawl/ecount/route.ts` (667 → 약 150 + 6개 파일)

#### 사전 확인

```bash
grep -rn "/api/crawl/ecount" src/                # fetch URL만
grep -rn "from.*app/api/crawl" src/              # 내부 import 없음 확인
```

#### 현재 외부 참조

- `components/logistics/ErpCrawlPanel.tsx` (HTTP fetch, URL만)

#### 분리 구조

| 새 파일                                | 책임                                                                                                    | 원본 라인     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------- |
| `lib/ecount/types.ts`                  | `LocatorScope`, `RawXlsxRow`, `InputHint` 등                                                            | 8–16, 585–596 |
| `lib/ecount/playwright-helpers.ts`     | `getScopes`, `getPageTextSnippet`, `collectFrameHints`, `collectCookieHints`, `fillFirst`, `clickFirst` | 23–114        |
| `lib/ecount/ecountAuth.ts`             | 로그인 로직 (`isLoginLikeUrl`, `pickBestPageAfterLogin`, `detectLoginError`, `loginToEcount`)           | 118–342       |
| `lib/ecount/ecountNavigation.ts`       | `waitForContentFrame`, `openLedgerAndFillFilters`                                                       | 170–425       |
| `lib/ecount/ecountExcel.ts`            | `downloadAndParseLedger`                                                                                | 427–553       |
| `lib/ecount/ecountPersist.ts`          | `persistOrdersToSupabase`                                                                               | 558–649       |
| `app/api/crawl/ecount/route.ts` (축약) | POST 핸들러 — 인증·env·오케스트레이션만                                                                 | —             |

#### 에러 응답 구조 (⚠️ 반드시 준수)

**문제점:** 원본 `route.ts`는 8개 에러 지점마다 `debug` 객체 필드 구성이 다름. 단일 `DebugInfo` 타입으로 통합하면 **일부 경로에서 필드 누락**되거나, 없던 필드가 `undefined`로 튀어나와 `ErpCrawlPanel.tsx`의 조건부 렌더링이 깨짐.

**에러 경로 전수 (원본 기준)**

| Line | 상황             | 응답 필드                                                                                              |
| ---- | ---------------- | ------------------------------------------------------------------------------------------------------ |
| 202  | 미인증           | `{error, status:401}`                                                                                  |
| 210  | env 부재         | `{error, missing{...}, status:500}`                                                                    |
| 226  | ERP 코드 없음    | `{error, status:400}`                                                                                  |
| 262  | 회사코드 실패    | `{error, debug{current_url, frames, page_text_snippet}, status:500}`                                   |
| 328  | 로그인 실패      | `{error, debug{current_url, frames, frame_count, frame_urls, page_text_snippet, cookies}, status:500}` |
| 389  | 품목코드 실패    | `{error, debug{...+has_ledger_frame, ledger_frame_url}, status:500}`                                   |
| 508  | 엑셀 버튼 미발견 | `{error, debug{...+all_buttons}, status:500}`                                                          |
| 572  | 매핑 없음        | `{error, hint, status:422}`                                                                            |

**실행 체크리스트 (순서대로 수행)**

- [ ] **DO-1.** 각 lib 함수가 `throw` 하는 에러 객체에 debug 필드를 **그 경로 고유 구성 그대로** 담을 것. 예: `loginToEcount`는 `{current_url, frames, frame_count, frame_urls, page_text_snippet, cookies}`만, `openLedgerAndFillFilters`는 `+has_ledger_frame, ledger_frame_url`까지 추가
- [ ] **DO-2.** `route.ts` POST 핸들러에서 각 lib 함수별로 `try/catch` 분기, catch 블록에서 그 함수가 던진 debug 객체를 **그대로** NextResponse에 담을 것
- [ ] **DO-3.** lib 함수들이 반환/throw 하는 타입을 **`lib/ecount/types.ts`에 경로별 개별 타입**으로 정의 (`LoginFailureDebug`, `FilterFailureDebug`, `ExcelFailureDebug` 등 3개+)
- [ ] **DO-4.** 리팩토링 직후 `ErpCrawlPanel.tsx`를 열어 debug 필드를 어떻게 렌더링하는지 확인. 원본 JSON 구조와 1:1 일치 여부를 `npm run dev`에서 실측
- [ ] **DO-5.** 각 에러 경로를 강제 유도해 실제 JSON 응답 수동 확인 (env 누락·잘못된 ERP 코드·로그인 실패·매핑 없음 4가지만이라도)

**금지사항**

- [ ] **DON'T-1.** `type DebugInfo = {current_url?; frames?; frame_count?; ...}` 같이 **모든 필드 optional로 합친 단일 타입** 만들지 말 것 → 각 경로에서 필드 누락 추적 불가
- [ ] **DON'T-2.** debug 필드명 변경·snake_case ↔ camelCase 변환·추가 필드 삽입 금지 (`ErpCrawlPanel`이 정확한 키로 접근)
- [ ] **DON'T-3.** HTTP status 코드 변경 금지 (401/400/422/500 구성 유지)
- [ ] **DON'T-4.** `CRAWL_DRY_RUN` 환경변수 분기 제거하지 말 것 — 테스트 시 필수

#### 주의

- 순환 import 방지: `ecountAuth`→`playwright-helpers`, `ecountPersist`→`supabase/server`만
- `playwright` 타입(`Page`, `Frame`, `BrowserContext`, `Download`)은 lib 파일별 직접 import
- `supabase/types.ts`의 `item_erp_mapping` 타입 그대로 사용

#### 검증

- `ErpCrawlPanel`에서 크롤링 수동 실행 (DRY_RUN=true)
- env 없는 상태에서도 `500 + missing` JSON 구조 일치 확인
- 품목코드 틀리게 입력 → `debug.has_ledger_frame` 필드 실제 나오는지 확인
- 매핑 없는 품목 → `422 + hint` 응답 확인

---

### 3.3 `ForecastDashboard.tsx` (565 → 약 140 + 7개 파일) [정민 영역]

#### 사전 확인

```bash
grep -rn "ForecastDashboard" src/
grep -rn "WinterRow\|PackRow\|OrderSimRow" src/  # 외부 참조 0건 확인
```

#### 현재 외부 참조

- `app/(dashboard)/analytics/forecast/page.tsx` → default import 1곳

#### 분리 구조 (flat, `analytics/forecast/` 이미 feature 폴더)

| 새 파일                                                      | 책임                                                                      | 원본 라인 |
| ------------------------------------------------------------ | ------------------------------------------------------------------------- | --------- |
| `lib/forecast/dataAgg.ts`                                    | `aggregateDailySales`, `aggregateWeeklyForecast`, `mergeSalesAndForecast` | 532–565   |
| `analytics/forecast/_hooks/useInsight.ts`                    | FastAPI `/forecast/insight` 호출                                          | 481–494   |
| `analytics/forecast/InsightCard.tsx`                         | AI 발주 인사이트 카드                                                     | 146–191   |
| `analytics/forecast/WinterAnalysisCard.tsx`                  | 겨울 검증                                                                 | 196–270   |
| `analytics/forecast/PackDistributionCard.tsx`                | 포장 단위별 분포                                                          | 275–407   |
| `analytics/forecast/OrderSimulationCard.tsx`                 | 발주 시뮬레이션                                                           | 412–476   |
| `analytics/forecast/KpiCard.tsx` + `EmptyHint`               | 공용 UI                                                                   | 499–530   |
| `analytics/forecast/ForecastDashboard.tsx` (축약, 위치 유지) | 헤더 + KPI + 차트 + 카드 조립 (default export 유지)                       | —         |

#### 주의

- `WinterRow`, `PackRow`, `OrderSimRow` 타입 외부 참조 없음 → 각 카드 파일 내부 로컬 타입으로 유지
- `FASTAPI_URL` 상수 기존 import 경로 유지

#### 검증

- `/analytics/forecast`: AI 인사이트/주간 차트/겨울 검증/포장 분포/발주 시뮬 5섹션
- FastAPI 오프라인 시 EmptyHint 표시

---

### 3.4 `dataPreprocess.ts` (509 → 약 25 브릿지 + 10개 파일) [정민 영역]

#### 사전 확인

```bash
grep -rn "dataPreprocess" src/
grep -rn "loadPromotionSales\|loadSeasonCompare\|loadRoi\|loadBudgetPlanner\|loadTimingOptimizer\|loadSeasonAlert" src/
```

#### 현재 외부 참조

- 6개 컴포넌트가 각자 load 함수 1개 + 타입 1개 (`BudgetPlanner`, `PromotionSalesOverlay`, `ROICalculator`, `SeasonAlertMonitor`, `SeasonCompare`, `TimingOptimizer`)

#### 분리 구조

| 새 파일                                                     | 책임                                                                                                                                                                    |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/promotion/types.ts`                                    | 7개 public 타입 + 내부 타입 (`Layer1Row`, `CostRow`)                                                                                                                    |
| `lib/promotion/constants.ts`                                | `TIMING_CAMPAIGNS`, `CANCELED_CONTRACT_NO`, `SHEET_*` 상수                                                                                                              |
| `lib/promotion/parseSheets.ts`                              | `loadWorkbook`, `sheetRows`, `parseLayer1Rows`, `parseCostRows`, `parsePromotionSheet`, `loadBaseData(monthlyPath, promotionPath)` (**경로 인자화**)                    |
| `lib/promotion/dateUtils.ts`                                | `parseKoreanYearMonth`, `parseDateFlex`, `parseDateString`, `isDateRangeOverMonth`, `addDays`, `toDateKey`, `toNumber`, `buildDailySalesAmountMap`, `buildWeeklySeries` |
| `lib/promotion/salesOverlay.ts`                             | `loadPromotionSalesOverlayDataset` (경로 인자 받음)                                                                                                                     |
| `lib/promotion/seasonCompare.ts`                            | `loadSeasonCompareDataset`                                                                                                                                              |
| `lib/promotion/roi.ts`                                      | `loadRoiDataset`                                                                                                                                                        |
| `lib/promotion/budgetPlanner.ts`                            | `loadBudgetPlannerReference`                                                                                                                                            |
| `lib/promotion/timingOptimizer.ts`                          | `loadTimingOptimizerDataset`                                                                                                                                            |
| `lib/promotion/seasonAlert.ts`                              | `loadSeasonAlertDataset`                                                                                                                                                |
| `components/analytics/promotion/dataPreprocess.ts` (브릿지) | asset URL 상수 유지 + load 함수 래퍼(경로 주입) + 타입 재노출                                                                                                           |

#### xlsx asset URL 처리 (⚠️ 반드시 준수)

**문제점:** 원본은 `new URL("./assets/...xlsx", import.meta.url)` 패턴 사용. `./assets/`는 **파일 위치 기준 상대 경로**라서, `dataPreprocess.ts`를 `lib/promotion/`으로 단순 이동하면 asset 경로 해석이 달라져 **빌드는 통과하지만 런타임에 xlsx 404 에러** 발생. 6개 프로모션 컴포넌트 전부 빈 화면.

**원본 현재 위치·파일**

```
src/components/analytics/promotion/
├── assets/
│   ├── 월별_판매납품_광고비_현황_v2.xlsx
│   └── 쿠팡_프로모션_진행현황.xlsx
├── dataPreprocess.ts                 ← new URL("./assets/...", import.meta.url)
├── PromotionSalesOverlay.tsx
├── SeasonCompare.tsx
├── ROICalculator.tsx
├── BudgetPlanner.tsx
├── TimingOptimizer.tsx
└── SeasonAlertMonitor.tsx
```

**해결 전략: 경로 인자화 + 브릿지에서 주입**

**실행 체크리스트 (순서대로 수행)**

- [ ] **DO-1.** `lib/promotion/parseSheets.ts`의 `loadBaseData` 시그니처를 **인자 받게** 변경:
  ```ts
  export async function loadBaseData(monthlyPath: string, promotionPath: string) { ... }
  ```
- [ ] **DO-2.** 6개 load 함수도 **옵셔널 인자** 받게:
  ```ts
  type LoadPaths = { monthly: string; promotion: string };
  export async function loadPromotionSalesOverlayDataset(paths: LoadPaths) { ... }
  ```
- [ ] **DO-3.** **assets 폴더는 이동하지 말 것.** 현 위치(`src/components/analytics/promotion/assets/`) 유지. 이동 시 번들러가 xlsx를 static asset으로 안 잡을 가능성 있음
- [ ] **DO-4.** `components/analytics/promotion/dataPreprocess.ts`를 브릿지로 유지:

  ```ts
  // 브릿지 (dataPreprocess.ts) — 구 경로 그대로
  const MONTHLY_DATA_FILE = new URL(
    "./assets/월별_판매납품_광고비_현황_v2.xlsx",
    import.meta.url
  ).toString();
  const PROMOTION_DATA_FILE = new URL(
    "./assets/쿠팡_프로모션_진행현황.xlsx",
    import.meta.url
  ).toString();

  import { loadPromotionSalesOverlayDataset as _loadOverlay } from "@/lib/promotion/salesOverlay";
  export const loadPromotionSalesOverlayDataset = () =>
    _loadOverlay({ monthly: MONTHLY_DATA_FILE, promotion: PROMOTION_DATA_FILE });
  // ... 5개 load 함수 동일 패턴
  export * from "@/lib/promotion/types";
  ```

- [ ] **DO-5.** 6개 컴포넌트의 호출부는 **절대 수정 금지**. `await loadXxx()` 인자 없이 호출하던 형태 그대로 유지됨 (브릿지가 경로 주입)
- [ ] **DO-6.** **`npm run dev` 에서 실제 xlsx 로드 시각 확인**. `npm run build`만 통과하면 안 됨 (빌드는 URL 자체를 체크하지 않음)
- [ ] **DO-7.** 6개 컴포넌트 각각 열어서 데이터 렌더 확인:
  - `/analytics/promotion` 하위 6개 섹션/탭 or 페이지
  - 빈 화면·0건·NaN 발생 시 xlsx 로드 실패 의심

**금지사항**

- [ ] **DON'T-1.** `src/components/analytics/promotion/assets/` 폴더를 `lib/promotion/assets/`로 옮기지 말 것. 옮기면 Next.js static file 처리가 바뀌어 런타임 경로 재파악 필요
- [ ] **DON'T-2.** 브릿지에서 `import.meta.url` 대신 하드코딩 경로(`"/src/components/..."`) 쓰지 말 것. Next.js turbopack 빌드 시 해시가 들어간 경로로 치환되어 맞지 않게 됨
- [ ] **DON'T-3.** load 함수를 인자 없는 버전으로 남기지 말 것. "편의를 위해 default 경로" 같은 대체 동작은 경로 깨짐 디버깅을 어렵게 함. 브릿지에서 주입하는 패턴만 유지
- [ ] **DON'T-4.** 6개 컴포넌트의 `await loadXxx()` 호출부에 경로 인자를 **추가하지 말 것**. 기존 호출부 무수정이 이 리팩토링의 핵심 목표

#### 검증

- `/analytics/promotion` 6개 컴포넌트 전부 데이터 렌더 확인 (`npm run dev`에서)
- 네트워크 탭에서 `.xlsx` 파일 HTTP 200 응답 확인
- `dataPreprocess.ts` 브릿지 파일이 구 경로에 존재하는지 최종 확인

---

### 3.5 `CoupangSkuAnalysisDialog.tsx` (549 → 약 250 + 3개 파일) [진희 영역]

#### 사전 확인

```bash
grep -rn "CoupangSkuAnalysisDialog" src/    # CoupangFcInventoryTab 1곳
```

#### 현재 외부 참조

- `components/logistics/CoupangFcInventoryTab.tsx` → **named import** 1곳

#### 분리 구조 (feature 폴더 신설)

```
src/components/logistics/
├── coupang-sku/                            ← NEW
│   ├── CoupangSkuAnalysisDialog.tsx       ← 이동 + 축약
│   ├── CoupangSkuChart.tsx                ← 차트 렌더
│   └── CoupangSkuSummaryGrid.tsx          ← 상단 5 카드
└── CoupangSkuAnalysisDialog.tsx           ← 브릿지 (export { CoupangSkuAnalysisDialog } from "./coupang-sku/CoupangSkuAnalysisDialog")
```

| 새 파일                                                     | 책임                                                                                             | 원본 라인 |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------- |
| `lib/logistics/coupangSkuAnalysis.ts`                       | `narrativeParagraphs`, `axisLabel`, `countStockoutStreakFromEnd`, `buildFacts`, `SeriesRow` 타입 | 32–115    |
| `logistics/coupang-sku/CoupangSkuChart.tsx`                 | ComposedChart 렌더링                                                                             | 396–502   |
| `logistics/coupang-sku/CoupangSkuSummaryGrid.tsx`           | 상단 5 카드                                                                                      | 325–394   |
| `logistics/coupang-sku/CoupangSkuAnalysisDialog.tsx` (축약) | fetch/상태/AI 호출 + 조립. **named export 유지**                                                 | —         |
| `logistics/CoupangSkuAnalysisDialog.tsx` (브릿지 1줄)       | `export { CoupangSkuAnalysisDialog } from "./coupang-sku/CoupangSkuAnalysisDialog"`              | —         |

#### 브릿지 코드 예시

```ts
// src/components/logistics/CoupangSkuAnalysisDialog.tsx (브릿지 1줄)
export { CoupangSkuAnalysisDialog } from "./coupang-sku/CoupangSkuAnalysisDialog";
```

```ts
// src/lib/logistics/coupangSkuAnalysis.ts 상단 — 순환 import 방지
import type { CoupangInventoryByCenterRow } from "@/components/logistics/_hooks/useCoupangInventoryByCenter";
// value import 금지 — 타입만 꺼내와야 lib → components 순환 없음
```

#### 주의

- `CoupangInventoryByCenterRow` 타입은 `import type` 만 (순환 import 방지)
- **named export 유지 필수** — default로 바꾸지 말 것
- 다이얼로그 props (`row`, `open`, `onOpenChange`) 시그니처 100% 보존
- `CoupangFcInventoryTab.tsx`의 `import { CoupangSkuAnalysisDialog } from "./CoupangSkuAnalysisDialog"` 구문은 **절대 수정 금지** (브릿지가 처리)

#### 검증

- `/logistics` → 쿠팡탭 → 행 클릭 → SKU 분석 다이얼로그 → 차트 + AI 분석 + 재분석
- 브릿지 파일 삭제 여부 확인 — 실수로 지우면 `CoupangFcInventoryTab` 컴파일 실패

---

### 3.6 `useMilkrunAllocations.ts` (456 → 약 60 shell + 7개 파일) [진희 영역, 최난이도]

#### 사전 확인

```bash
grep -rn "useMilkrunAllocations" src/
grep -rn "MilkrunHistorySummary\|MilkrunHistoryRecord\|MilkrunDailyRow\|MilkrunDetail\|MilkrunExportLine\|MilkrunSaveLineInput" src/
```

#### 현재 외부 참조

- `MilkrunHistoryTab.tsx`: 8개 심볼 (훅 + 타입 7개)
- `MilkrunCalculatorTab.tsx`: 1개 (훅)

#### 분리 구조 (`_hooks/milkrun/` feature 서브폴더)

```
src/components/logistics/_hooks/
├── milkrun/                              ← NEW
│   ├── types.ts
│   ├── internals.ts
│   ├── saveAllocation.ts
│   ├── listByRange.ts
│   ├── listLinesForCsvExport.ts
│   ├── getDetail.ts
│   └── remove.ts
└── useMilkrunAllocations.ts              ← shell (위치·이름 유지)
```

| 새 파일                                   | 책임                                                                             | 원본 라인 |
| ----------------------------------------- | -------------------------------------------------------------------------------- | --------- |
| `_hooks/milkrun/types.ts`                 | 7개 public 타입 + DB Row 타입 + 상수 `T_ALLOC`, `T_ITEMS`                        | 9–93      |
| `_hooks/milkrun/internals.ts`             | `normalizeYmd`, `ymdFromDb`, `isMissingRelationError`, `normalizeItemsForInsert` | 94–128    |
| `_hooks/milkrun/saveAllocation.ts`        | `saveAllocation`                                                                 | 133–199   |
| `_hooks/milkrun/listByRange.ts`           | `listByRange`                                                                    | 201–277   |
| `_hooks/milkrun/listLinesForCsvExport.ts` | `listLinesForCsvExport`                                                          | 280–362   |
| `_hooks/milkrun/getDetail.ts`             | `getDetail`                                                                      | 364–428   |
| `_hooks/milkrun/remove.ts`                | `remove`                                                                         | 430–453   |
| `_hooks/useMilkrunAllocations.ts` (shell) | supabase 생성 + 5개 useCallback 래퍼 + 타입 7개 `export type` 재노출             | —         |

#### 핵심 브릿지 구조

```ts
// _hooks/useMilkrunAllocations.ts (shell)
export type {
  MilkrunSaveLineInput,
  MilkrunHistorySummary,
  MilkrunHistoryRecord,
  MilkrunDailyRow,
  MilkrunDetailItem,
  MilkrunDetail,
  MilkrunExportLine,
} from "./milkrun/types";

export function useMilkrunAllocations() {
  /* 래퍼 */
}
```

#### 주의

- `as never` 패턴 (`T_ALLOC = "allocations" as never`) 그대로 복제 — supabase/types 미반영 우회
- `computeAllocations` (from `@/lib/milkrun-compute`)는 필요한 파일마다 재 import
- 타입 전부 `export type { ... }` 명시 (isolatedModules 대비)

#### 검증

- `/logistics/milkrun`: 저장 / 목록 / 기간 CSV / 상세 / 삭제 5 시나리오 + 테이블 미생성 상태 에러 메시지

---

### 3.7 `LeadTimeTracker.tsx` (800 → 약 320 + 4개 파일) [진희 영역, 최대 작업량]

#### 사전 확인

```bash
grep -rn "LeadTimeTracker" src/   # page.tsx 1곳
```

#### 현재 외부 참조

- `app/(dashboard)/logistics/leadtime/page.tsx` → default import 1곳

#### 분리 구조 (feature 폴더 신설)

```
src/components/logistics/
├── leadtime/                           ← NEW
│   ├── LeadTimeTracker.tsx            ← 이동 + 축약
│   ├── LeadTimeStageCard.tsx          ← 5단계 진행 카드
│   ├── NewLeadTimeDialog.tsx          ← 신규 등록 다이얼로그
│   └── DelayBadge.tsx                 ← 지연 배지
└── LeadTimeTracker.tsx                ← 브릿지 1줄
```

| 새 파일                                         | 책임                                                   | 원본 라인 |
| ----------------------------------------------- | ------------------------------------------------------ | --------- |
| `lib/logistics/leadTimeCalc.ts`                 | 순수 계산 12개 함수 + `DB_STEPS` 상수                  | 32–140    |
| `lib/logistics/leadTimeExcel.ts`                | `downloadLeadTimeListExcel`                            | 159–185   |
| `logistics/leadtime/DelayBadge.tsx`             | `DelayBadge` 컴포넌트                                  | 142–157   |
| `logistics/leadtime/LeadTimeStageCard.tsx`      | 5단계 진행 카드 (입력 폼 + BL 포함)                    | 410–532   |
| `logistics/leadtime/NewLeadTimeDialog.tsx`      | `NewOrderDialog` → 이름 유지하며 파일만 분리           | 731–800   |
| `logistics/leadtime/LeadTimeTracker.tsx` (축약) | 상태·핸들러·레이아웃·테이블 + **default export 유지**  | —         |
| `logistics/LeadTimeTracker.tsx` (브릿지 1줄)    | `export { default } from "./leadtime/LeadTimeTracker"` | —         |

#### lib/logistics/leadTimeCalc.ts 에 이동할 함수 전체 (누락 방지)

1. `calcDelay` (line 40)
2. `subtractCalendarDays` (line 44)
3. `getComputedShanghaiExpected` (line 52)
4. `getMaxDelay` (line 63)
5. `getStatus` (line 80)
6. `currentStageLabel` (line 87)
7. `currentStagePillClass` (line 95)
8. `isStepCurrent` (line 102)
9. `getActualValue` (line 109)
10. `getExpectedValue` (line 116)
11. `getStoredExpected` (line 127)
12. `stepCardClass` (line 134)
13. 상수 `DB_STEPS` (line 32)

각 함수는 `LeadTimeRow`, `LeadtimeDbStep` 타입을 인자로 받음 → `lib/logistics/leadTimeCalc.ts` 상단에 `import type { LeadTimeRow, LeadtimeDbStep } from "@/components/logistics/_hooks/useLeadTime"` 추가.

**`DelayBadge` 컴포넌트 (142–157)** 는 `calcDelay`를 호출 → `leadtime/DelayBadge.tsx` 에서 `import { calcDelay } from "@/lib/logistics/leadTimeCalc"` 재 import.

#### 주의

- `LeadTimeRow`, `LeadtimeDbStep` 타입은 `./_hooks/useLeadTime`에서 import
- `LeadTimeStageCard`, `DelayBadge`에 `"use client"` 필요 여부 확인 (lucide-react 사용 + 상태 미보유이지만 부모가 client면 무관)
- `variant="section"` / `"page"` 분기 유지
- `NewLeadTimeDialog`의 원본 이름 `NewOrderDialog`은 **파일명만 변경**하고 export 심볼명은 유지하지 말 것 — `NewLeadTimeDialog`로 일치시켜 의미 명확화. 유일한 호출부(`LeadTimeTracker.tsx` 내부)도 함께 rename

#### 검증

- `/logistics/leadtime`: 목록 / 단계 카드 / BL 조회 / 엑셀 추출 / 신규 등록 / 삭제
- 브릿지 `components/logistics/LeadTimeTracker.tsx` 존재 + `import LeadTimeTracker from "@/components/logistics/LeadTimeTracker"` 동작 확인

---

## 4. 실행 순서 & 타이밍

### 4.1 권장 작업 순서 (충돌 위험 역순)

| 순  | 대상                       | 브릿지 필요        | 근거                                       |
| --- | -------------------------- | ------------------ | ------------------------------------------ |
| 1   | `MarginCalculator`         | X (이동 없음)      | 슬아 영역, 패턴 확립                       |
| 2   | `ecount/route.ts`          | X (API route)      | 팀 무관, 내부 구현만                       |
| 3   | `ForecastDashboard`        | X (이동 없음)      | 정민 영역, 현재 정민 브랜치 submain과 동일 |
| 4   | `dataPreprocess`           | O (브릿지 필요)    | 정민 영역, 경로 주입 래퍼 핵심             |
| 5   | `CoupangSkuAnalysisDialog` | O                  | 진희 영역, feature 폴더 신규               |
| 6   | `useMilkrunAllocations`    | X (원본 위치 유지) | 진희 영역, 타입 8개 재노출                 |
| 7   | `LeadTimeTracker`          | O                  | 진희 영역, 가장 큰 분해                    |

### 4.2 커밋·푸시 규칙

**단일 PR**: 7개 파일 분리 모두 완료 후 한 번에 PR 제출. 커밋 단위는:

- **파일 1개 분리 완료 = 커밋 1개** (변경 범위 명확·롤백 가능)
- 각 커밋 직후 `git push`

커밋 메시지:

```
[PM] refactor: MarginCalculator 분해 (→ 7 sub-컴포넌트)

- 외부 import 경로 및 시그니처 무변경 (CostAnalyticsDashboard)
- 987 → 약 350 + 7 파일
- 기능 변화 없음, 수동 회귀 4건 통과
```

### 4.3 롤백 전략

- 커밋 1개 = 파일 1개 원칙
- 문제 시 `git revert <hash>` 한 번으로 해당 파일만 복구
- 절대 force-push 금지, 문제는 새 커밋으로 고침

### 4.4 브랜치·PR

- 신규 브랜치: `refactor` (submain에서 분기)
- 단일 PR로 제출 (PM 자체 리뷰 후 submain merge)
- PR 제목 예: `[PM] refactor: 대용량 파일 7개 분리 (총 4,533 LOC)`
- 사전 팀원 공지 생략 (refactor.md 자체가 문서 역할)

---

## 5. 예상 결과 (사전 시뮬레이션)

### 5.1 LOC 변화

| 파일                     | 원본      | 분리 후 원본/브릿지 | 새 파일 수             | 새 파일 LOC 합 | 총 LOC       |
| ------------------------ | --------- | ------------------- | ---------------------- | -------------- | ------------ |
| LeadTimeTracker          | 800       | 약 320 + 브릿지 1줄 | +5 (4 feature + 2 lib) | 약 520         | 840          |
| CoupangSkuAnalysisDialog | 549       | 약 250 + 브릿지 1줄 | +4 (3 feature + 1 lib) | 약 310         | 560          |
| ecount/route.ts          | 667       | 약 150              | +6 lib                 | 약 550         | 700          |
| MarginCalculator         | 987       | 약 350              | +7 flat                | 약 680         | 1,030        |
| ForecastDashboard        | 565       | 약 140              | +7 (6 flat + 1 lib)    | 약 450         | 590          |
| useMilkrunAllocations    | 456       | 약 60 shell         | +7 sub                 | 약 420         | 480          |
| dataPreprocess           | 509       | 약 25 브릿지        | +10 lib                | 약 510         | 535          |
| **합계**                 | **4,533** | **약 1,295**        | **+46**                | **약 3,440**   | **약 4,735** |

### 5.2 디렉터리 변화

**신설 디렉터리:**

- `src/components/logistics/leadtime/` (4 파일)
- `src/components/logistics/coupang-sku/` (3 파일)
- `src/components/logistics/_hooks/milkrun/` (7 파일)
- `src/lib/ecount/` (6 파일)
- `src/lib/promotion/` (10 파일)
- `src/lib/forecast/` (1 파일)
- `src/lib/logistics/` (3 파일: leadTimeCalc, leadTimeExcel, coupangSkuAnalysis)

**파일 수 변화:** 7개 → 53개 (+46)
**파일 평균 LOC:** 647 → 89 (-86%)

### 5.3 팀원 기능 커버리지 (재검증 완료)

**검증 방법**: 각 원본 파일의 모든 export/내부 함수/컴포넌트 목록화 후 옵션 D 매핑 확인. 추가로 `src/` 전체 grep으로 deep import 존재 여부 검사.

| 파일                     | 내부 요소 수                   | 매핑 커버리지 | 외부 심볼     | 블로커         |
| ------------------------ | ------------------------------ | ------------- | ------------- | -------------- |
| LeadTimeTracker          | 16개 (함수/컴포넌트/타입)      | 완전          | default 1     | 없음           |
| CoupangSkuAnalysisDialog | 5개                            | 완전          | named 1       | 없음           |
| useMilkrunAllocations    | 8 export + 4 internal          | 완전          | 훅+타입 8     | 없음           |
| MarginCalculator         | 14+ 섹션/sub-component         | 완전          | Props+default | 없음           |
| ForecastDashboard        | 10개                           | 완전          | default       | 없음           |
| dataPreprocess           | 6 load + 15 internal + 7 types | 완전          | load+타입 13  | 경로 주입 필요 |
| ecount/route             | 8 에러 경로                    | 완전          | POST 응답     | 없음           |

**Deep import 탐지 결과: 0건** (lib 하위 비공개 헬퍼를 외부에서 참조하는 케이스 없음)

### 5.4 타입 에러 가능성 지점

| 리스크                       | 원인                                                         | 대응                                  |
| ---------------------------- | ------------------------------------------------------------ | ------------------------------------- |
| `isolatedModules` true 대응  | 7+ 타입 재노출                                               | `export type { ... }` 단독 문법 사용  |
| lib → components 순환 import | `coupangSkuAnalysis.ts`가 `CoupangInventoryByCenterRow` 참조 | `import type`만 사용 (type-only)      |
| setter prop 타입             | `Dispatch<SetStateAction<...>>`                              | 자식에 그대로 전달                    |
| xlsx asset URL 경로          | `dataPreprocess` lib 이동 시 404                             | path 인자화 + 상수는 브릿지 유지      |
| ecount debug 필드 축약       | 에러 경로별 구조 상이                                        | 경로별 타입 분리, 단일 타입 통합 금지 |

### 5.5 UX/기능 변화

**절대 없어야 함.** 검증 방법:

- 파일 분리 직후 `npm run build` + `npm run lint` 통과
- 수동 회귀 테스트 (페이지별):
  - `/logistics/leadtime` — 목록, 단계 카드, BL, 엑셀, 신규, 삭제
  - `/logistics` → 쿠팡탭 → 행 클릭 → SKU 분석 다이얼로그
  - `/logistics/milkrun` — 저장, 조회, 삭제, CSV
  - `/analytics/cost` — 상품 선택, 환율, 차트 렌더
  - `/analytics/forecast` — 4 카드, 판매/예측 차트
  - `/analytics/promotion` — 6 컴포넌트 xlsx 로드
  - ErpCrawlPanel — 크롤링 DRY_RUN=true

---

## 6. 피해야 할 함정

1. **순환 import** — lib → components는 `import type`만 허용
2. **타입 export 누락** — 런타임 OK, 빌드 깨지는 숨은 에러. `tsc --noEmit` 필수
3. **xlsx dynamic URL** — `import.meta.url` 경로는 파일 이동 시 런타임 404. `dataPreprocess` 분해 시 path 인자화 + 브릿지에서 경로 주입
4. **`as never` 타입 회피 패턴** — `useMilkrunAllocations`의 supabase/types 미반영 우회, 그대로 복제
5. **ecount debug 필드 통합 금지** — 에러 경로별로 구조 상이 (has_ledger_frame, all_buttons 등 경로별 추가 필드 있음). 단일 타입으로 묶으면 깨짐
6. **시그니처 변경 금지** — default/named export 종류 바꾸지 말 것. props interface명 유지
7. **브릿지 파일 삭제 금지** — 이동한 파일의 구 경로에 export 1줄 반드시 유지 (외부 import 유지용)
8. **이모지 자제** — PROJECT_RULES.md 명시 없지만 기존 코드 스타일 존중
9. **커밋 prefix** — `[PM]` 사용 (PROJECT_RULES.md 컨벤션)

---

## 7. 작업 시작 직전 체크리스트

- [ ] `git status` clean 확인
- [ ] `git checkout submain && git pull` (PR #26 머지 반영)
- [ ] `git checkout -b refactor` 신규 브랜치
- [ ] `npm run dev` 기동 확인, 기준 동작 베이스라인 시각 확인
- [ ] 각 파일 작업 전 §3 사전 확인 명령어 실행
- [ ] 파일 분리 후: `npm run build` → `npm run lint` → 수동 회귀 → 커밋 → push
- [ ] 7개 모두 완료 후 단일 PR 생성 (타이틀: `[작업자] refactor: 대용량 파일 7개 분리`)

### 7.1 Husky pre-commit 통과 요건 (.husky/pre-commit 확인 완료)

각 커밋마다 자동 실행됨:

- [ ] **secretlint** — 스테이징 파일에 비밀키 포함 금지. refactor 작업은 코드 이동만이라 리스크 낮지만, 원본에 실수로 붙어있던 주석 하드코딩 키가 이동하면 차단됨 → 발견 시 `.env.local` 이관
- [ ] **lint-staged** — eslint/prettier 자동 실행. 이동한 파일에서 unused import, any 타입 등 경고 시 커밋 차단
- [ ] **금지 라이브러리 검사** — package.json 건드리는 경우만 해당. 이번 리팩토링은 무관 (새 패키지 추가 없음)
- [ ] **PROJECT_RULES.md ↔ .cursorrules 동기화** — PROJECT_RULES.md 수정 안 하면 무관

### 7.2 중간 실패 시 대응

- lint-staged 실패 → 에러 복사 후 원인 수정, 같은 커밋에 재시도 (`--amend` 금지, 새 변경사항이면 새 커밋)
- secretlint 차단 → 해당 줄을 `.env.local` 이관하고 `process.env.X` 참조로 변경 후 재커밋
- 수동 회귀 실패 → `git revert <hash>`로 해당 파일만 복구 후 원인 분석

---

## 8. 최종 검증 결과 (2026-04-19 v2)

**옵션 D(feature 폴더) 기반 재설계 + 팀원 기능 커버리지 재검증 완료.**

- 7개 파일의 **53개 하위 요소 전부** 옵션 D 구조로 매핑 (누락 0)
- Deep import 탐지: **0건**
- 외부 참조자: 총 13곳 (전부 식별, 브릿지로 호환 유지)
- 블로커: **없음**
- 주의사항 2건 (관리 가능):
  - xlsx asset URL 경로 주입 (§3.4)
  - ecount debug 필드 경로별 상이 (§3.2)

**→ 진행 가능.**
