# VISUAL_REFERENCE.md — 핫팩 시즌 대시보드 시각 토큰

> 🎯 **역할**: `/analytics/weatherkey` 페이지의 **단일 시각 소스(Single Source of Truth)**.
> CSS 변수, Tailwind 확장, chart.js JS 상수, 숫자·날짜 포맷, 아이콘 규약을 한 곳에서 정의한다.
> 참조: `HOTPACK_DASHBOARD_LAYOUT.md` (섹션 구조), `HOTPACK_SEASON.md` (전체 규칙).
> 최종 갱신: 2026-04-21

---

## 0. 원칙

1. **팔레트 B (모노 + 악센트)** — 회색 5단계 + 한파 악센트 3단계.
2. **기존 shadcn 모노크롬과 공존** — 신규 색은 `--hotpack-*` 네임스페이스로 격리.
3. **CSS 변수(런타임) ↔ JS 상수(chart.js 주입) 양쪽 동기화** — 불일치 시 토큰 모듈이 원본.
4. **다크 모드 대응 필수** — 악센트는 유지, 모노 구간은 명도 반전.
5. **색만으로 의미를 전달하지 않는다** — 반드시 레이블/아이콘/패턴 병행 (접근성).

---

## 1. 컬러 토큰 — 기온 7구간 (팔레트 B)

| #   | 구간             | HEX       | 토큰               | 의미               |
| --- | ---------------- | --------- | ------------------ | ------------------ |
| 1   | `t ≥ 15°C`       | `#E8E6E1` | `--hotpack-temp-1` | 따뜻               |
| 2   | `10 ≤ t < 15°C`  | `#D1CFC7` | `--hotpack-temp-2` | 10~15°C            |
| 3   | `5 ≤ t < 10°C`   | `#B5B2A8` | `--hotpack-temp-3` | 쌀쌀               |
| 4   | `0 ≤ t < 5°C`    | `#918E84` | `--hotpack-temp-4` | 체감겨울           |
| 5   | `−5 ≤ t < 0°C`   | `#D97757` | `--hotpack-temp-5` | 영하 (악센트 시작) |
| 6   | `−10 ≤ t < −5°C` | `#B84A2E` | `--hotpack-temp-6` | 한파               |
| 7   | `t < −10°C`      | `#7A2F1F` | `--hotpack-temp-7` | 강한파             |

**판정 함수 규약** (JS):

```ts
export function tempBand(t: number): 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  if (t >= 15) return 1;
  if (t >= 10) return 2;
  if (t >= 5) return 3;
  if (t >= 0) return 4;
  if (t >= -5) return 5;
  if (t >= -10) return 6;
  return 7;
}
```

---

## 2. 컬러 토큰 — 차트 데이터셋

### 2.1 메인 차트 (판매 bar + 기온 line)

| 대상               | 값                                                                 | 토큰                       |
| ------------------ | ------------------------------------------------------------------ | -------------------------- |
| 판매 bar           | 그 날의 `tempBand(temp_min)` → `--hotpack-temp-{1..7}`             | (동적)                     |
| 기온 line          | `#7A2F1F`                                                          | `--hotpack-line-temp`      |
| 기온 point         | `#7A2F1F` (hover 시 radius 5)                                      | 동일                       |
| 0°C 기준선         | `rgba(70, 130, 80, 0.5)` + `borderDash [6,4]`                      | `--hotpack-zero-line`      |
| 7일 이동평균(옵션) | `#918E84` dashed `[4,3]`                                           | `--hotpack-line-ma`        |
| 이벤트 세로선      | `rgba(122, 47, 31, 0.5)` featured / `rgba(122, 47, 31, 0.25)` 일반 | `--hotpack-event-marker`   |
| 이벤트 라벨 배경   | `rgba(122, 47, 31, 0.9)`                                           | 동일                       |
| 툴팁 배경          | `rgba(255, 252, 248, 0.98)` (warm cream)                           | `--hotpack-tooltip-bg`     |
| 툴팁 텍스트        | `#2A1007` (타이틀) / `#3A1810` (본문)                              | `--hotpack-tooltip-fg`     |
| 툴팁 테두리        | `rgba(122, 47, 31, 0.3)`                                           | `--hotpack-tooltip-border` |
| 그리드 선          | `rgba(122, 47, 31, 0.06)`                                          | `--hotpack-grid`           |

### 2.2 키워드 라인 차트 (5 키워드 × 일별 지수)

B 팔레트의 악센트(붉은 주황)와 hue 충돌 없이 5개 명확히 구분되도록 **중채도 다채색**:

| 키워드 슬롯                         | HEX       | 토큰                  | 톤         |
| ----------------------------------- | --------- | --------------------- | ---------- |
| `keyword_catalog.display_order = 1` | `#3B5B7A` | `--hotpack-keyword-1` | Slate Blue |
| `display_order = 2`                 | `#4B8A82` | `--hotpack-keyword-2` | Teal       |
| `display_order = 3`                 | `#B88E5A` | `--hotpack-keyword-3` | Amber      |
| `display_order = 4`                 | `#6B5A8E` | `--hotpack-keyword-4` | Plum       |
| `display_order = 5`                 | `#7A8E4B` | `--hotpack-keyword-5` | Olive      |

> **매핑 원칙**: `keyword_catalog`의 `display_order` 또는 `id` 순서로 **고정**. 검색량 순위에 따라 색이 바뀌지 않음(legend 일관성).
>
> 💡 조정 의견 있으면 M5 착수 전에 말씀해주세요. Blue 계열 단색 5단도 대안.

**라인 스타일**: 모두 solid · borderWidth 1.6 · tension 0.15 · pointRadius 0 (hover 시 3).
**7일 MA**: 같은 색 · dashed `[4,3]` · opacity 0.6.
**급등 마커(ratio ≥ 2.0)**: pointRadius 5 · borderColor white · borderWidth 1.5.

---

## 3. 컬러 토큰 — 트리거 심각도

실제 `v_hotpack_trigger_effects.trigger_key` 5종에 맞춰 **3단계** 심각도로 매핑 (Low는 현재 매핑 없음).

| 트리거                 | 심각도   | HEX       | 토큰                         | 의미                                                                                                |
| ---------------------- | -------- | --------- | ---------------------------- | --------------------------------------------------------------------------------------------------- |
| `cold_shock`           | Critical | `#B84A2E` | `--hotpack-trigger-critical` | 전일 대비 `temp_min` ≤ −6℃ (`trigger_config.cold_shock_tmin_delta`). 25시즌 정밀도 100%, 배수 2.68× |
| `compound`             | Critical | `#B84A2E` | `--hotpack-trigger-critical` | cold_shock + first_freeze 등 복합 발동 — 최강 신호                                                  |
| `first_freeze`         | High     | `#D97757` | `--hotpack-trigger-high`     | 시즌 내 최초 영하 (1회성). 전주 대비 2.67배 폭발                                                    |
| `search_spike_hotpack` | High     | `#D97757` | `--hotpack-trigger-high`     | "핫팩" 키워드 배수 ≥ 1.5 (`trigger_config.search_spike_ratio`) — 판매 선행 지표                     |
| `search_spike_any`     | Medium   | `#918E84` | `--hotpack-trigger-medium`   | 5개 키워드 중 하나라도 배수 ≥ 1.5 — 보조 신호                                                       |

**우선순위** (중복 발동 시 상위 1개만 전면 카드로 노출):
`compound` > `cold_shock` > `first_freeze` > `search_spike_hotpack` > `search_spike_any`

**복합 발동(`compound=true`) 처리**:

- 단독 구성 트리거(cold_shock·first_freeze 등)가 동시에 발동된 상황이 많음
- UI: `compound` 카드 하나로 병합 표시, 내부에 구성 트리거 작은 배지로 보조 표기 → 중복 카드 방지

**표시 규약** (TriggerRow):

- 🔴 **발동 중 (오늘)**: 좌측 컬러 라인 4px + 배경 `color/10` 틴트
- 🟠 **예정 (내일, 예보 추정)**: 좌측 컬러 라인 2px + 배경 투명 + 신뢰도 배지
- ⚪ **비발동**: 외곽선만 `border-muted`

---

## 4. 컬러 토큰 — 예보 Source 위계

| source           | 설명        | 배경                                               | 텍스트                  |
| ---------------- | ----------- | -------------------------------------------------- | ----------------------- |
| `asos`           | 실측(확정)  | `transparent`                                      | `text-foreground`       |
| `forecast_short` | 단기 D+1~5  | `rgba(59, 91, 122, 0.08)` `--hotpack-source-short` | `text-foreground`       |
| `forecast_mid`   | 중기 D+6~10 | `rgba(59, 91, 122, 0.04)` `--hotpack-source-mid`   | `text-muted-foreground` |

**배지 라벨**: `실측` / `단기예보` / `중기예보` (한글, 아이콘 병행).

---

## 5. 컬러 토큰 — 데이터 건강도 배지

| 상태 | 조건 (`v_hotpack_data_freshness.days_behind`) | HEX                              | 토큰                    | 시그널 |
| ---- | --------------------------------------------- | -------------------------------- | ----------------------- | ------ |
| Good | `≤ 2`                                         | `oklch(0.65 0.16 145)` (emerald) | `--hotpack-health-good` | 🟢     |
| Warn | `3 ~ 5`                                       | `oklch(0.76 0.15 80)` (amber)    | `--hotpack-health-warn` | 🟡     |
| Bad  | `≥ 6` 또는 cron 실패                          | `var(--destructive)`             | `--hotpack-health-bad`  | 🔴     |

호버 툴팁: 소스별(`asos` · `forecast_short` · `forecast_mid` · `keyword`) 최신성 4줄.

---

## 6. 타이포그래피 · 숫자 포맷

### 6.1 숫자

| 종류         | 포맷                                                                                           | 예시                |
| ------------ | ---------------------------------------------------------------------------------------------- | ------------------- |
| 판매량(개수) | `Intl.NumberFormat('ko-KR')`                                                                   | `52,110개`          |
| GMV(원)      | `Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 })` | `₩18,430,500`       |
| 온도         | `.toFixed(1) + '°C'`                                                                           | `−8.1°C`            |
| 상관계수     | `.toFixed(3)` (부호 유지)                                                                      | `−0.832`            |
| 배수         | `.toFixed(2) + '×'`                                                                            | `2.68×`             |
| 검색지수     | `.toFixed(0)`                                                                                  | `87`                |
| 증감 %       | `(v >= 0 ? '+' : '') + v.toFixed(1) + '%'`                                                     | `+23.4%` / `−12.7%` |

### 6.2 날짜

| 용도             | 포맷                 | 예시                |
| ---------------- | -------------------- | ------------------- |
| 풀 포맷(툴팁 등) | `YYYY. M. D. (요일)` | `2025. 12. 3. (수)` |
| 카드/리스트      | `MM/DD`              | `12/03`             |
| 상대 시각        | `ko-KR relative`     | `3시간 전`          |
| D±N              | `D±N`                | `D+3`, `D−7`        |

### 6.3 본문 폰트

- 기본: `var(--font-sans)` (shadcn 기본, Geist)
- 숫자 표기: 필요 시 `font-variant-numeric: tabular-nums`로 정렬

---

## 7. 아이콘 규약 (lucide-react)

| 맥락                  | 아이콘                                    |
| --------------------- | ----------------------------------------- |
| 사이드바 핫팩 시즌    | `Triangle` (기존)                         |
| 데이터 건강도         | `Activity` / `CircleDot`                  |
| 시즌 셀렉터           | `Calendar`                                |
| AI 브리프             | `Sparkles`                                |
| 튜닝 제안             | `SlidersHorizontal`                       |
| 관리자 팝오버         | `MoreHorizontal`                          |
| 트리거 — cold_shock   | `Zap`                                     |
| 트리거 — first_freeze | `Snowflake`                               |
| 트리거 — extreme_cold | `ThermometerSnowflake` (또는 `Snowflake`) |
| 트리거 — heat_rebound | `ThermometerSun`                          |
| 예보 실측             | (아이콘 없음, 텍스트 강조)                |
| 예보 단기             | `CloudSun`                                |
| 예보 중기             | `Cloud`                                   |
| 급등 키워드           | `TrendingUp`                              |

사이즈: 기본 `h-4 w-4`, 헤더 `h-5 w-5`, 차트 인라인 `h-3.5 w-3.5`.

---

## 8. 간격 · 둥글기 · 그림자

| 용도                      | 값                                  |
| ------------------------- | ----------------------------------- |
| 섹션 간 gap               | `space-y-4` (16px)                  |
| 카드 내부 padding         | `p-4`                               |
| KpiCard · ForecastDayCard | `rounded-md`, `border`, `shadow-sm` |
| 드로어                    | shadcn `Sheet` 기본                 |
| 차트 컨테이너             | `rounded-md border bg-card`         |

(shadcn 기본값 그대로 사용 — 이 페이지 전용 커스텀 없음.)

---

## 9. globals.css 추가 스펙

M2 착수 시 `src/app/globals.css`의 `:root`와 `.dark`에 다음 블록을 추가한다 (기존 shadcn 변수 **아래**에 삽입).

```css
:root {
  /* ─── Hotpack Season — 기온 팔레트 B ─── */
  --hotpack-temp-1: #e8e6e1;
  --hotpack-temp-2: #d1cfc7;
  --hotpack-temp-3: #b5b2a8;
  --hotpack-temp-4: #918e84;
  --hotpack-temp-5: #d97757;
  --hotpack-temp-6: #b84a2e;
  --hotpack-temp-7: #7a2f1f;

  /* 차트 라인/마커 */
  --hotpack-line-temp: #7a2f1f;
  --hotpack-line-ma: #918e84;
  --hotpack-zero-line: rgba(70, 130, 80, 0.5);
  --hotpack-event-marker: rgba(122, 47, 31, 0.5);
  --hotpack-tooltip-bg: rgba(255, 252, 248, 0.98);
  --hotpack-tooltip-fg: #2a1007;
  --hotpack-tooltip-border: rgba(122, 47, 31, 0.3);
  --hotpack-grid: rgba(122, 47, 31, 0.06);

  /* 키워드 */
  --hotpack-keyword-1: #3b5b7a;
  --hotpack-keyword-2: #4b8a82;
  --hotpack-keyword-3: #b88e5a;
  --hotpack-keyword-4: #6b5a8e;
  --hotpack-keyword-5: #7a8e4b;

  /* 트리거 */
  --hotpack-trigger-critical: #b84a2e;
  --hotpack-trigger-high: #d97757;
  --hotpack-trigger-medium: #918e84;
  --hotpack-trigger-low: #b5b2a8;

  /* 예보 source */
  --hotpack-source-short: rgba(59, 91, 122, 0.08);
  --hotpack-source-mid: rgba(59, 91, 122, 0.04);

  /* 건강도 */
  --hotpack-health-good: oklch(0.65 0.16 145);
  --hotpack-health-warn: oklch(0.76 0.15 80);
  --hotpack-health-bad: var(--destructive);
}

.dark {
  --hotpack-temp-1: #2a2825;
  --hotpack-temp-2: #3d3b36;
  --hotpack-temp-3: #5a5751;
  --hotpack-temp-4: #7a766c;
  --hotpack-temp-5: #d97757;
  --hotpack-temp-6: #d46344;
  --hotpack-temp-7: #c75a3f;

  --hotpack-line-temp: #d97757;
  --hotpack-zero-line: rgba(120, 180, 130, 0.5);
  --hotpack-event-marker: rgba(217, 119, 87, 0.6);
  --hotpack-tooltip-bg: rgba(30, 27, 22, 0.98);
  --hotpack-tooltip-fg: #f5e9dc;
  --hotpack-tooltip-border: rgba(217, 119, 87, 0.4);
  --hotpack-grid: rgba(217, 119, 87, 0.08);

  --hotpack-keyword-1: #6b8eab;
  --hotpack-keyword-2: #7fbab0;
  --hotpack-keyword-3: #d9b080;
  --hotpack-keyword-4: #9b89b9;
  --hotpack-keyword-5: #a9bc7d;

  --hotpack-trigger-critical: #d97757;
  --hotpack-trigger-high: #e3a082;
  --hotpack-trigger-medium: #7a766c;
  --hotpack-trigger-low: #5a5751;

  --hotpack-source-short: rgba(107, 142, 171, 0.1);
  --hotpack-source-mid: rgba(107, 142, 171, 0.05);
}
```

**`@theme inline` 확장 (Tailwind v4, 유틸리티 `bg-hotpack-temp-5` 등 활성화)**:

```css
@theme inline {
  /* ...기존 shadcn 매핑 유지 */

  --color-hotpack-temp-1: var(--hotpack-temp-1);
  --color-hotpack-temp-2: var(--hotpack-temp-2);
  --color-hotpack-temp-3: var(--hotpack-temp-3);
  --color-hotpack-temp-4: var(--hotpack-temp-4);
  --color-hotpack-temp-5: var(--hotpack-temp-5);
  --color-hotpack-temp-6: var(--hotpack-temp-6);
  --color-hotpack-temp-7: var(--hotpack-temp-7);

  --color-hotpack-keyword-1: var(--hotpack-keyword-1);
  --color-hotpack-keyword-2: var(--hotpack-keyword-2);
  --color-hotpack-keyword-3: var(--hotpack-keyword-3);
  --color-hotpack-keyword-4: var(--hotpack-keyword-4);
  --color-hotpack-keyword-5: var(--hotpack-keyword-5);

  --color-hotpack-trigger-critical: var(--hotpack-trigger-critical);
  --color-hotpack-trigger-high: var(--hotpack-trigger-high);
  --color-hotpack-trigger-medium: var(--hotpack-trigger-medium);
  --color-hotpack-trigger-low: var(--hotpack-trigger-low);

  --color-hotpack-health-good: var(--hotpack-health-good);
  --color-hotpack-health-warn: var(--hotpack-health-warn);
  --color-hotpack-health-bad: var(--hotpack-health-bad);
}
```

이후 Tailwind 유틸리티로 사용: `bg-hotpack-temp-6 text-white`, `text-hotpack-trigger-critical`, `bg-hotpack-keyword-1/10` 등.

---

## 10. chart.js 전용 JS 토큰 모듈

chart.js 옵션에는 CSS 변수를 직접 못 넣으므로 런타임에서 쓸 **상수 모듈**을 둔다 (단일 진실 원본). 파일: `src/components/analytics/weatherkey/_tokens.ts`

```ts
// src/components/analytics/weatherkey/_tokens.ts
// ⚠️ 이 파일은 docs/VISUAL_REFERENCE.md §1~§5의 HEX 값을 그대로 복제한다.
// 둘 중 한쪽만 바뀌면 안 된다. (M7 체크리스트에서 diff 검증)

export const TEMP_BANDS = [
  { min: 15, label: "따뜻", color: "#E8E6E1" },
  { min: 10, label: "10~15°C", color: "#D1CFC7" },
  { min: 5, label: "쌀쌀", color: "#B5B2A8" },
  { min: 0, label: "체감겨울", color: "#918E84" },
  { min: -5, label: "영하", color: "#D97757" },
  { min: -10, label: "한파", color: "#B84A2E" },
  { min: -Infinity, label: "강한파", color: "#7A2F1F" },
] as const;

export function tempCategory(t: number) {
  return TEMP_BANDS.find((b) => t >= b.min)!;
}

export const CHART_TOKENS = {
  lineTemp: "#7A2F1F",
  lineMa: "#918E84",
  zeroLine: "rgba(70, 130, 80, 0.5)",
  eventMarker: {
    featured: "rgba(122, 47, 31, 0.5)",
    normal: "rgba(122, 47, 31, 0.25)",
    label: "rgba(122, 47, 31, 0.9)",
  },
  tooltip: {
    bg: "rgba(255, 252, 248, 0.98)",
    fg: "#2A1007",
    subFg: "#3A1810",
    border: "rgba(122, 47, 31, 0.3)",
  },
  grid: "rgba(122, 47, 31, 0.06)",
  zoomDrag: "rgba(107, 46, 30, 0.12)",
} as const;

export const KEYWORD_COLORS = [
  "#3B5B7A", // slot 1
  "#4B8A82", // slot 2
  "#B88E5A", // slot 3
  "#6B5A8E", // slot 4
  "#7A8E4B", // slot 5
] as const;

export const TRIGGER_COLORS = {
  cold_shock: { hex: "#B84A2E", level: "critical" },
  first_freeze: { hex: "#D97757", level: "high" },
  extreme_cold: { hex: "#918E84", level: "medium" },
  heat_rebound: { hex: "#B5B2A8", level: "low" },
} as const;
```

**다크 모드 처리**: chart.js 인스턴스는 `prefers-color-scheme` 또는 `<html class="dark">` 감지 후 토큰 세트를 전환한다. M3에서 `useDarkMode()` 훅 추가 예정.

---

## 11. 컨트라스트 · 접근성

- **색 + 텍스트**: 기온 색만으로 구분하지 않고 카드에 "−8.1°C" 숫자 필수 병기.
- **트리거 배지**: 색 + 아이콘 + 한글 레이블 3중.
- **기온 히트 bar**: hover/focus 시 검정 1px 외곽선 강조.
- **WCAG AA 검증 필요 쌍** (M7):
  - `#918E84` 배경 + `text-foreground` (라이트) → 대비 4.5 이상 필수
  - `#7A2F1F` 배경 + `#FFFFFF` 텍스트 → 통과 예상 (수동 확인)
  - 다크 모드 `--hotpack-temp-*` 전부 검증

---

## 12. 변경 규약

- HEX 값은 **본 문서 §1~§5가 원본**. `_tokens.ts`와 `globals.css`는 이 문서의 복제.
- 색을 바꿀 때 **세 곳 동시 수정**:
  1. 이 문서
  2. `src/app/globals.css` (`:root` 및 `.dark`)
  3. `src/components/analytics/weatherkey/_tokens.ts`
- PR 제목: `[PM] visual: ...`
- M7 체크리스트에 "세 곳 diff 검증" 포함.
