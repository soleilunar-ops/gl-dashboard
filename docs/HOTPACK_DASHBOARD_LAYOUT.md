# HOTPACK_DASHBOARD_LAYOUT.md — 핫팩 시즌 대시보드 레이아웃 설계

> 🎯 **역할**: `/analytics/weatherkey` 한 페이지 안에 핫팩 시즌 분석의 **모든 핵심 정보**를 응축하는 레이아웃 명세.
> 참조: `HOTPACK_SEASON.md` (데이터 자산), `hotpack_season_runbook.md` (운영), `PaddingSalesChart.tsx` (메인 차트 프로토타입).
> 최종 갱신: 2026-04-21

---

## 0. 설계 원칙

1. **스크롤 없이 한 화면 가시** (1440×900 뷰포트 기준).
2. **raw 테이블 쿼리 금지** — 전부 `v_hotpack_*` / `v_keyword_*` 뷰 경유.
3. **시즌 경계는 `fn_current_season()` 또는 `season_config`에서 조회** (하드코딩 금지).
4. **데이터 건강도는 배지로 압축** — 별도 섹션 아님.
5. **탭 금지 · 아코디언 금지** — 모든 섹션 동시 가시.
6. **파일 경계**: 모든 신규 컴포넌트 `src/components/analytics/weatherkey/` 내부.

---

## 1. 전체 그리드

```
┌──────────────────────────────────────────────────────────────────┐ ← 56px (앱 상단 Header, 기존)
├──────────────────────────────────────────────────────────────────┤
│ [A] 페이지 상단바                                            48px │
├──────────────────────────────────────────────────────────────────┤
│ [B] KPI 스트립 (4카드)                                      100px │
├────────────────────────────────────┬─────────────────────────────┤
│                                    │  [C-트리거]            220px │
│ [C-메인] 판매×기온 시계열 차트      ├─────────────────────────────┤
│                               520px│  [C-예보] 10일 D-7~D+10 284px│
│                                    │                             │
├────────────────────────────────────┴─────────────────────────────┤
│ [D] 키워드 검색지수 (5 키워드 + MA + 급등 마커)             260px │
└──────────────────────────────────────────────────────────────────┘

총 뷰포트 소비 = 56 + 48 + 100 + 520 + 260 + gap(16×4) + padding(48) ≈ 1,096px
```

- 컨테이너: `<main className="mx-auto w-full max-w-[1440px] px-6 py-6 space-y-4">`
- 섹션 간 gap: `space-y-4` (16px)
- 섹션 C 좌우: `grid grid-cols-3 gap-4`, 차트 `col-span-2`, 우측 `col-span-1 flex flex-col gap-4`

---

## 2. 섹션 명세

### [A] 상단바 — 높이 48px

```
┌──────────────────────────────────────────────────────────────┐
│  핫팩 시즌 대시보드  [시즌 ▾ 26시즌]   🟢 데이터 최신   · (⋯)  │
└──────────────────────────────────────────────────────────────┘
```

| 요소               | 좌/우 | 내용                                                 | 데이터 소스                                  |
| ------------------ | ----- | ---------------------------------------------------- | -------------------------------------------- |
| 페이지 타이틀      | L     | "핫팩 시즌 대시보드" h1 (sr-only label `weatherkey`) | 정적                                         |
| 시즌 셀렉터        | L     | shadcn `Select` · 옵션: `season_config.season` DESC  | `season_config`                              |
| 데이터 건강도 배지 | R     | 🟢 ≤2일 / 🟡 3~5일 / 🔴 6일+                         | `v_hotpack_data_freshness.days_behind`       |
| 마지막 동기화 ts   | R     | "3시간 전" 상대시각                                  | `v_cron_job_status.last_run_finished_at` MIN |
| 관리자 팝오버      | R     | ⋯ 버튼 클릭 → cron 4종 상태 + 수동 리프레시          | `v_cron_job_status`                          |
| 튜닝 제안 뱃지     | R     | 🔔 N건 — pending 있을 때만 표시 → 슬라이드오버       | `v_pending_tuning_proposals`                 |
| AI 브리프 버튼     | R     | 🤖 항상 표시 → 슬라이드오버(최신 시즌 브리프)        | `hotpack_llm_reports` (kind='season_brief')  |

**인터랙션:**

- 시즌 변경 → B·C·D 전부 리페치 (`?season=` query 동기화).
- 배지 호버 → 소스별 최신성 툴팁(`asos`, `forecast_short`, `forecast_mid`, `keyword`).
- ⋯ 클릭 → 팝오버에 cron 4종 테이블 + "지금 동기화" 버튼(Edge Function POST).
- 🔔 클릭 → `TuningProposalDrawer` (pending 제안 리스트 + 현재→제안 diff + 승인/반려).
- 🤖 클릭 → `SeasonBriefDrawer` (최신 시즌 브리프 마크다운 + "다시 생성" 버튼, rate limit 10분 1회).

**컴포넌트**: `DashboardHeader.tsx` · `SeasonSelect.tsx` · `DataHealthBadge.tsx` · `AdminPopover.tsx`

---

### [B] KPI 스트립 — 높이 100px, 4카드 1행

```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│ 총 판매량    │ r_log       │ 피크일       │ first_freeze│
│ 1.52M        │ −0.84       │ 12/03        │ 11/17       │
│ ▲ 25시즌    │ ≈ 25시즌    │ 52,110개    │ D−3 (어제)  │
└─────────────┴─────────────┴─────────────┴─────────────┘
```

| 카드         | 주값                 | 보조                           | 컬러 의미             |
| ------------ | -------------------- | ------------------------------ | --------------------- | ----- | ----------------------- |
| 총 판매량    | `total_units`        | 25시즌 대비 ±%                 | 증가=그린 / 감소=레드 |
| r_log        | `r_log` 소수 3자리   | 25시즌(−0.832)과의 델타        |                       | −0.80 | ↑=정상 그린 / 약화=앰버 |
| 피크일       | `peak_date` MM/DD    | `peak_units` · 해당일 기온     | 한파 색상             |
| first_freeze | `first_freeze` MM/DD | 25시즌 대비 D±N, 오늘 대비 D±N | 도래 안했으면 회색    |

- 각 카드 우하단에 **sparkline** (이번 시즌 누적 vs 25시즌 동일 progress).
- 단일 쿼리: `SELECT * FROM v_hotpack_season_stats WHERE season IN (<current>, '25시즌')`.

**컴포넌트**: `SeasonKpiStrip.tsx` → `KpiCard.tsx × 4`

---

### [C-메인] 판매×기온 시계열 차트 — 높이 520px

**베이스**: `PaddingSalesChart.tsx` 그대로 이식 + 확장.

| 데이터셋                 | 종류 | y축        | 스타일                       |
| ------------------------ | ---- | ---------- | ---------------------------- |
| 판매량(`units_sold`)     | bar  | ySales(좌) | 기온 구간별 7색 (팔레트 TBD) |
| 최저기온(`temp_min`)     | line | yTemp(우)  | 단색, 0.25 tension           |
| (옵션) 7일 이동평균 판매 | line | ySales     | 점선 토글 버튼               |

**X축**: `sale_date` (time scale, 기본 unit: `month`).

**이벤트 마커** — `annotation` 플러그인:

- `first_sub_10`, `first_freeze`, `first_sub_minus_5`, `first_arctic` (v_hotpack_season_stats에서 한 시즌 한 행)
- `peak_date`
- 시즌 경계 (start/end)
- 추후: 설 연휴·수능·크리스마스 등 `timeline_events` 테이블 확장

**인터랙션:**

- 휠 줌 / 드래그 선택 줌 / Shift+드래그 팬
- 기간 프리셋 버튼: `전체` · `가을(9-11월)` · `피크(11-1월)` · `겨울(12-2월)` · `최근 30일` · `초기화`
- 툴팁: 일자(요일) · 판매량 · 전일 대비 ±% · 기온·기온 구간 라벨 · 발동 트리거 배지
- 클릭: 해당 날짜가 D-7~D+10 창 안이면 **10일 예보 섹션에서 해당 날짜 카드를 하이라이트**

**데이터 소스**:

```sql
SELECT sale_date, dow, day_of_season,
       temp_min, temp_max, temp_avg,
       units_sold, gmv
FROM v_hotpack_season_daily
WHERE season = :season
ORDER BY sale_date;
```

**컴포넌트**: `SeasonTimelineChart.tsx` (PaddingSalesChart 기반) · `_hooks/useSeasonDaily.ts`

---

### [C-트리거] 오늘/내일 알람 패널 — 높이 220px

```
┌──────────────────────────────────────┐
│ 🔴 오늘 발동 중 · cold_shock         │
│     tmin_delta −7.2°C (기준 −6)      │
│     예상 배수: 2.68×                 │
├──────────────────────────────────────┤
│ 🟡 내일 예정 · first_freeze 가능     │
│     예보 최저 −1.1°C (기준 0)        │
├──────────────────────────────────────┤
│ ⚪ extreme_cold · heat_rebound 무    │
└──────────────────────────────────────┘
```

**트리거 5종** (실제 `v_hotpack_trigger_effects.trigger_key` 기준, 3단계 심각도):

| 트리거                 | 심각도   | 조건                                                                | 25시즌 기준/성격        |
| ---------------------- | -------- | ------------------------------------------------------------------- | ----------------------- |
| `cold_shock`           | Critical | 전일 대비 `temp_min` ≤ −6℃ (`trigger_config.cold_shock_tmin_delta`) | 정밀도 100%, 배수 2.68× |
| `compound`             | Critical | cold_shock + first_freeze 등 복합 동시                              | 드물지만 최강           |
| `first_freeze`         | High     | 시즌 내 최초 `temp_min < 0℃` (1회성)                                | 2025-11-17, 전주 2.67×  |
| `search_spike_hotpack` | High     | "핫팩" 키워드 배수 ≥ 1.5 (`trigger_config.search_spike_ratio`)      | 판매 선행 지표          |
| `search_spike_any`     | Medium   | 5개 키워드 중 하나라도 배수 ≥ 1.5                                   | 보조 신호               |

**데이터 스키마**:

- `v_hotpack_triggers`는 **날짜별 1행 + 각 트리거 boolean 컬럼** (pivot 형태):
  `{ date, season, cold_shock, compound, first_freeze, search_spike_any, search_spike_hotpack, tmin_delta, temp_min, max_keyword_ratio, spiked_keywords, ... }`

**SQL — 오늘 발동**:

```sql
SELECT date, cold_shock, compound, first_freeze,
       search_spike_any, search_spike_hotpack,
       tmin_delta, temp_min, max_keyword_ratio, spiked_keywords
FROM v_hotpack_triggers
WHERE date = CURRENT_DATE
LIMIT 1;
```

**SQL — 내일 추정** (뷰에 미래 row 없음 → 예보 기반 JS 추정):

```sql
-- 오늘 기저(전일 대비 계산용)
SELECT temp_min FROM v_hotpack_triggers WHERE date = CURRENT_DATE;

-- 내일 예보
SELECT temp_min, source FROM weather_unified
WHERE station = '서울' AND weather_date = CURRENT_DATE + 1
ORDER BY CASE source WHEN 'asos' THEN 0 WHEN 'forecast_short' THEN 1 WHEN 'forecast_mid' THEN 2 END
LIMIT 1;
```

내일 추정 로직 (JS):

- `cold_shock 가능`: `forecast.tmin_tomorrow − today.temp_min ≤ −6`
- `first_freeze 가능`: 시즌 내 first_freeze 미발생 && `forecast.tmin_tomorrow < 0`
- `search_spike_*`는 예측 불가 → 내일 섹션에서 생략

**우선순위 & 중복**: `compound` > `cold_shock` > `first_freeze` > `search_spike_hotpack` > `search_spike_any`.
`compound=true`인 날은 구성 트리거 카드 중복 표시 억제 (compound 카드 내부 배지로만).

**인터랙션**:

- 트리거 카드 클릭 → 메인 차트에서 해당 날짜 애니메이션 하이라이트
- "왜 이 기준?" 링크 → `TRIGGER_LOGIC.md` 섹션 앵커(향후 문서)

**컴포넌트**: `TriggerAlertPanel.tsx` · `TriggerRow.tsx` · `_hooks/useTriggersTodayTomorrow.ts`

---

### [C-예보] 10일 예보(D-7 ~ D+10) — 높이 284px

세로 카드 리스트 (스크롤 가능, 오늘 위치 고정 sticky).

```
┌───────────────────────────────────┐
│ D-3  수  11/17 (first_freeze)     │
│ 실측 · −0.8 / 4.2 · ☔ 0.5mm      │
├───────────────────────────────────┤
│ D-0  오늘  11/20                  │
│ 실측 · −3.2 / 2.1 · 🔴 cold_shock │
├───────────────────────────────────┤
│ D+1  금  11/21                    │
│ 단기예보 · −4.5 / 1.0  (80%)     │
├───────────────────────────────────┤
│ D+5  화  11/25                    │
│ 중기 · −2.0 / 3.0                 │
└───────────────────────────────────┘
```

**source별 시각적 위계**:

- `asos`: 진한 텍스트, 배경 없음
- `forecast_short` (D+1~5): 옅은 파란 배경, 신뢰도 뱃지
- `forecast_mid` (D+6~10): 더 옅은 배경, 최고/최저만 표시 (중기는 강수 null)

**데이터 소스**:

```sql
SELECT weather_date, source, forecast_day,
       temp_min, temp_max, temp_avg,
       precipitation, humidity_avg
FROM weather_unified
WHERE station = '서울'
  AND weather_date BETWEEN CURRENT_DATE - 7 AND CURRENT_DATE + 10
ORDER BY weather_date,
  CASE source
    WHEN 'asos' THEN 0
    WHEN 'forecast_short' THEN 1
    WHEN 'forecast_mid' THEN 2
  END;
```

> 같은 날짜에 asos·forecast 둘 다 있으면 asos 우선. 향후 `v_weather_forecast_merged` 뷰(P1 과제) 생성 시 교체.

**컴포넌트**: `TenDayForecastList.tsx` · `ForecastDayCard.tsx` · `_hooks/useTenDayWeather.ts`

---

### [D] 키워드 검색지수 — 높이 260px, full width

```
┌──────────────────────────────────────┬──────────────────┐
│                                      │ 오늘 급등 TOP 3  │
│ (라인 차트: 5 키워드 × 일별 지수 0~100)│ 1. 핫팩     3.2× │
│  7일 MA 점선 (토글)                   │ 2. 손난로   2.1× │
│  급등 마커 (ratio ≥ 2.0)             │ 3. 찜질팩   1.8× │
│                                      │                  │
└──────────────────────────────────────┴──────────────────┘
```

**데이터 소스**:

```sql
-- 라인
SELECT trend_date, keyword, search_index, ma_7d, ratio_vs_ma
FROM v_keyword_daily_with_ma
WHERE trend_date >= CURRENT_DATE - 60;

-- 오늘 급등 TOP 3
SELECT keyword, ratio_vs_ma
FROM v_keyword_daily_with_ma
WHERE trend_date = CURRENT_DATE
  AND ratio_vs_ma IS NOT NULL
ORDER BY ratio_vs_ma DESC
LIMIT 3;
```

**인터랙션**:

- 범례 클릭: 키워드 on/off
- MA 토글: 7일 이동평균 점선 on/off
- 급등 마커 호버: "X월 Y일 · 검색지수 Z · MA 대비 N배"
- TOP 3 카드 클릭: 해당 키워드만 솔로 뷰

**컴포넌트**: `KeywordTrendsPanel.tsx` · `KeywordSurgeCard.tsx` · `_hooks/useKeywordTrends.ts`

---

## 3. 컴포넌트 트리

```
src/components/analytics/weatherkey/
├── WeatherkeyDashboard.tsx            ← 현재 placeholder, 재구성
├── DashboardHeader.tsx                [A]
│   ├── SeasonSelect.tsx
│   ├── DataHealthBadge.tsx
│   ├── TuningProposalsBadge.tsx       ← pending 있을 때만 🔔 N건
│   ├── AIBriefButton.tsx              ← 🤖 상단바 CTA
│   └── AdminPopover.tsx
├── drawers/
│   ├── TuningProposalDrawer.tsx       ← Opus 제안 리뷰·승인
│   └── SeasonBriefDrawer.tsx          ← Sonnet 시즌 브리프 렌더
├── SeasonKpiStrip.tsx                 [B]
│   └── KpiCard.tsx
├── SeasonTimelineChart.tsx            [C-메인]   ← PaddingSalesChart 기반
├── TriggerAlertPanel.tsx              [C-트리거]
│   └── TriggerRow.tsx
├── TenDayForecastList.tsx             [C-예보]
│   └── ForecastDayCard.tsx
├── KeywordTrendsPanel.tsx             [D]
│   └── KeywordSurgeCard.tsx
├── _types.ts                          공용 타입
└── _hooks/
    ├── useCurrentSeason.ts            fn_current_season() + season_config
    ├── useSeasonStats.ts              v_hotpack_season_stats
    ├── useSeasonDaily.ts              v_hotpack_season_daily
    ├── useTriggersTodayTomorrow.ts    v_hotpack_triggers
    ├── useTenDayWeather.ts            weather_unified (±10일)
    ├── useKeywordTrends.ts            v_keyword_daily_with_ma
    └── useDataHealth.ts               v_hotpack_data_freshness + v_cron_job_status
```

**공유 유틸**: 기존 `src/components/shared/` 재사용 (`StatCard`, `ChartContainer`, `EmptyState`, `LoadingSpinner`, `DateRangePicker`).

---

## 4. 데이터 페칭 규약

| 훅                         | 의존성           | 리프레시                                     |
| -------------------------- | ---------------- | -------------------------------------------- |
| `useCurrentSeason`         | —                | 마운트 1회                                   |
| `useSeasonStats`           | season           | 시즌 변경                                    |
| `useSeasonDaily`           | season           | 시즌 변경                                    |
| `useTriggersTodayTomorrow` | —                | 10분 폴링 + 수동                             |
| `useTenDayWeather`         | —                | 10분 폴링 + 수동                             |
| `useKeywordTrends`         | (최근 60일 고정) | 30분 폴링 + 수동                             |
| `useDataHealth`            | —                | 10분 폴링                                    |
| `useTuningProposals`       | —                | 10분 폴링 (pending 카운트만, 초기 로드 포함) |
| `useLatestSeasonBrief`     | season           | 드로어 오픈 시 lazy (초기 로드 제외)         |

모두 Supabase 브라우저 클라이언트(`@/lib/supabase/client`) 직접 호출. 서버 쿼리 캐시는 두지 않고 컴포넌트 로컬 상태 + `visibilitychange` 리포커스 리페치 정도로 충분.

**에러/로딩 규약**:

- 로딩: 섹션별 skeleton (`<Skeleton />`). 전체 페이지 로더 금지.
- 에러: 섹션별 인라인 Alert + "다시 시도". 다른 섹션은 정상 렌더.
- 빈 데이터: `<EmptyState />` + 원인 힌트 (예: "26시즌 데이터 없음 — 9월부터 채워집니다").

---

## 5. URL 쿼리 ↔ 상태 동기화

- `?season=26시즌` — 시즌 셀렉터와 양방향 바인딩
- `?from=YYYY-MM-DD&to=YYYY-MM-DD` — 메인 차트 줌 상태
- `?keyword=핫팩` — 키워드 솔로 뷰
- `?highlight=2025-12-03` — 메인 차트 + 10일 예보 동시 포커스

구현은 Next `useSearchParams` + `router.replace`, debounce 300ms.

---

## 6. 반응형 breakpoint

| 뷰포트             | C 섹션 레이아웃                                           | 차트 높이 | 비고                  |
| ------------------ | --------------------------------------------------------- | --------- | --------------------- |
| ≥1280px (데스크탑) | `grid-cols-3` 메인 2+우1                                  | 520       | 원안                  |
| 1024–1279px        | `grid-cols-2` 메인 풀 + 우측 2패널 아래로 → `grid-cols-2` | 440       | 트리거/예보 가로 병렬 |
| <1024px (태블릿↓)  | 전부 세로 스택                                            | 360       | 키워드 legend 세로    |

(팀 내부 대시보드용이므로 모바일(<640px)은 별도 최적화 생략.)

---

## 7. 접근성 & 한글

- 차트 영역 `aria-label` 필수 ("핫팩 시즌 일별 판매량과 최저기온 시계열").
- 기온 구간 7색은 **색맹 대응을 위해 패턴(텍스처)도 함께 제공**(향후 토글).
- 숫자: `toLocaleString('ko-KR')`.
- 날짜: "YYYY. M. D. (요일)" 일관.
- 절대 `\uXXXX` 이스케이프 금지 (HOTPACK_SEASON.md 규칙).

---

## 8. 확정사항 (2026-04-21)

- ✅ **색상 팔레트: B (모노 + 악센트)** — 회색 베이스 + 한파만 붉게. 기온 7구간 토큰은 `VISUAL_REFERENCE.md`에서 상세 정의.
- ✅ **차트 라이브러리: chart.js 스택 신규 도입** — `chart.js` + `react-chartjs-2` + `chartjs-adapter-date-fns` + `date-fns` + `chartjs-plugin-zoom` + `chartjs-plugin-annotation`. 기존 `recharts`와 공존.
- ✅ **기본 시즌: 하이브리드** — `fn_current_season()` active 있으면 active, 없으면 가장 최근 closed. URL `?season=` 우선.
- ✅ **사이드바 라벨: "핫팩 시즌"** — 페이지 h1은 "핫팩 시즌 대시보드".
- ✅ **경로: `/analytics/weatherkey` 유지**.
- ✅ **LLM 기능 2가지 동시 탑재** (상세 스펙 §11):
  - 튜닝 제안 (시즌 `is_closed` 전환 시, 모델 `claude-opus-4-7`)
  - 시즌 브리프 (주간 cron + 수동, 모델 `claude-sonnet-4-6`)

---

## 9. 구현 마일스톤 (한 페이지 = 한 스프린트)

| #   | 단위       | 산출물                                                  | 의존             |
| --- | ---------- | ------------------------------------------------------- | ---------------- |
| M1  | 뼈대       | `WeatherkeyDashboard.tsx` 레이아웃 셸 + 7개 훅 skeleton | —                |
| M2  | 상단바+KPI | A·B 섹션 완결                                           | M1               |
| M3  | 메인 차트  | PaddingSalesChart 이식 + 실데이터 바인딩 + 이벤트 마커  | M1 + 팔레트 확정 |
| M4  | 우측 패널  | 트리거·10일 예보                                        | M1               |
| M5  | 키워드     | 키워드 라인 + 급등 카드                                 | M1               |
| M6  | 인터랙션   | URL 상태·리페치·차트-예보-트리거 크로스 하이라이트      | M2~M5            |
| M7  | 마감       | 반응형·로딩·에러·접근성·문서 업데이트                   | M6               |

---

## 10. 구현 체크리스트 (PR 단위)

- [ ] `WeatherkeyDashboard`가 10줄 초과 시 하위 섹션 컴포넌트로 분해
- [ ] `page.tsx`는 `<WeatherkeyDashboard />` 호출만 (CLAUDE.md 규칙 #3)
- [ ] 모든 쿼리 파라미터는 바인드 파라미터, 문자열 concat 금지
- [ ] 차트 재마운트 최소화 (`useMemo` for data, `useRef` for chart instance)
- [ ] Supabase 호출 실패 시 섹션 단위 복구
- [ ] 25시즌 데이터로 시각 회귀 테스트 (r_log=-0.832, peak 2025-12-03, first_freeze 2025-11-17)
- [ ] 라이트/다크 모드 대비 검증
- [ ] 네트워크 탭: 페이지 초기 로드에서 쿼리 8개 이하 (튜닝 제안 카운트 포함, 시즌 브리프는 드로어 오픈 시 lazy)

---

## 11. LLM 기능 스펙

### 11.1 튜닝 제안 (시즌 종료 시)

**트리거**: `season_config.is_closed`가 `false → true`로 전환.
**감지**: DB trigger 또는 매일 pg_cron (`check-closed-seasons-daily`).
**모델**: `claude-opus-4-7` (환경변수 `ANTHROPIC_TUNING_MODEL` 오버라이드 가능).
**빈도**: 연 1~2회 (시즌 종료 직후).

**Edge Function**: `propose-trigger-tuning`

입력 프롬프트 구성:

- 방금 closed된 시즌의 `v_hotpack_trigger_effects` 전체 (트리거별 배수·정밀도)
- `v_hotpack_season_stats` 해당 시즌 + 25시즌 기준선 비교
- 현재 `trigger_config` 전체
- 과거 모든 closed 시즌의 정밀도 추이

출력 (JSON):

```json
{
  "proposals": [
    {
      "trigger_name": "cold_shock",
      "current_threshold": -6,
      "proposed_threshold": -7,
      "reasoning_md": "26시즌 정밀도 72%로 하락. 한파 양상이 완만해진 해로 기준을 강화 필요...",
      "confidence": 0.82
    }
  ],
  "summary_md": "...(200자 이내 총평)"
}
```

**신규 테이블**: `trigger_tuning_proposals`

```sql
CREATE TABLE trigger_tuning_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season text NOT NULL,
  trigger_name text NOT NULL,
  current_threshold numeric NOT NULL,
  proposed_threshold numeric NOT NULL,
  reasoning_md text NOT NULL,
  confidence numeric,
  model text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  approved_by text,
  approved_at timestamptz,
  rejection_reason text
);

CREATE VIEW v_pending_tuning_proposals AS
SELECT * FROM trigger_tuning_proposals WHERE status = 'pending';
```

**UI**:

- `TuningProposalsBadge` (상단바): pending 있을 때만 🔔 N건 표시
- `TuningProposalDrawer` (슬라이드오버):
  - 제안별 카드: 현재값 → 제안값 diff, 근거 마크다운, confidence 바
  - 버튼: **[승인]** (→ `trigger_config` UPDATE + `status='approved'` + `approved_by/at`) / **[반려(사유 입력)]**
  - 승인·반려 기록 영구 보존 (감사용)

### 11.2 시즌 브리프 (주간 + 수동)

**트리거**:

- pg_cron: 매주 월요일 09:00 KST (`generate-season-brief-weekly`)
- 수동: 상단바 🤖 → `SeasonBriefDrawer` → "다시 생성"
- 이벤트(옵션): `first_freeze` / `cold_shock` 최초 발동 시 자동 생성

**모델**: `claude-sonnet-4-6` (환경변수 `ANTHROPIC_SEASON_BRIEF_MODEL` 오버라이드 가능).

**Edge Function**: `generate-season-brief` — `hotpack_season_runbook.md` §3 프롬프트 템플릿 그대로 사용. 800자 이내 출력.

**신규 테이블**: `hotpack_llm_reports`

```sql
CREATE TABLE hotpack_llm_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season text NOT NULL,
  kind text NOT NULL
    CHECK (kind IN ('season_brief','surge_alert','first_breakthrough','season_closing')),
  body_md text NOT NULL,
  prompt_hash text NOT NULL,
  model text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON hotpack_llm_reports (season, kind, generated_at DESC);
```

**UI**:

- `AIBriefButton` (상단바): 🤖 항상 표시
- `SeasonBriefDrawer`:
  - 최신 브리프 마크다운 렌더
  - 메타: 생성일·모델·다음 자동 생성 예정 시각
  - 버튼: **[다시 생성]** (rate limit 10분 1회)
  - 이전 브리프 히스토리 드롭다운 (선택적)

### 11.3 공용 규칙

- **프롬프트 해시**: `prompt_hash` 컬럼으로 동일 입력 중복 호출 방지 (10분 윈도우 안에서는 기존 결과 반환).
- **모델 분리**: 두 기능 모두 `.env` 오버라이드, 코드 하드코딩 금지.
- **감사**: 두 테이블 모두 `model`·`generated_at`·`prompt_hash` 필수.
- **rate limit**: Edge Function 레벨에서 10분 1회.
- **에러**: LLM 호출 실패 시 대시보드에는 "생성 실패" 토스트 + 이전 성공본 유지.
- **비용 가드**: Edge Function 입력 토큰 상한 (튜닝 10K / 브리프 8K). 초과 시 요약 압축 후 재호출.
