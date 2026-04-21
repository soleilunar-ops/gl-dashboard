# TRIGGER_LOGIC.md — 25시즌 트리거·임계값 실측 기록

> 🎯 **역할**: `v_hotpack_triggers` / `v_hotpack_trigger_effects` 의 판정 공식, 25시즌 실측 숫자, cold_shock 7건 검색 동반 움직임, 임계값 시뮬레이션 결과를 사실만 기록.
> 참조: `HOTPACK_SEASON.md` (자산 카탈로그), `HOTPACK_DASHBOARD_LAYOUT.md §2 [C-트리거]`.
> 최종 갱신: 2026-04-21

---

## 1. 요약표 (25시즌 DB 실측)

### 1.1 트리거 5종 집계

| 트리거                 | 발동일 | 평균 배수 | 정밀도 |
| ---------------------- | ------ | --------- | ------ |
| `cold_shock`           | 7일    | 3.00×     | 100%   |
| `compound`             | 3일    | 3.13×     | 100%   |
| `first_freeze`         | 1일    | 3.14×     | 100%   |
| `search_spike_hotpack` | 27일   | 2.25×     | 30%    |
| `search_spike_any`     | 30일   | 2.03×     | 27%    |

### 1.2 단순 회귀 (25시즌 211일)

| 관계                          | n   | Pearson r | R²        |
| ----------------------------- | --- | --------- | --------- |
| 기온 → 판매 (당일)            | 211 | −0.644    | **0.415** |
| 검색 → 판매 (당일)            | 211 | 0.005     | 0.000     |
| 검색 → 판매 (D+1)             | 210 | −0.022    | 0.000     |
| 검색 → 판매 (cold_shock 한정) | 7   | 0.170     | 0.029     |

**예측식 (단순 선형, 기온 한정)**:

```
판매 ≈ −560 × temp_min + 9,354
```

---

## 2. 트리거 5종 조건·임계값 (뷰 정의)

| 트리거                 | 조건                                                                              | 파라미터 원천                                    |
| ---------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------ |
| `cold_shock`           | 당일 `temp_min` − 전일 `temp_min` ≤ **−6℃**                                       | `trigger_config.cold_shock_tmin_delta` (현재 −6) |
| `first_freeze`         | 시즌 내 최초로 `temp_min < 0℃`                                                    | 뷰 정의 하드코딩 (1회성)                         |
| `search_spike_hotpack` | "핫팩" 키워드 `ratio_to_ma ≥ 1.5`                                                 | `trigger_config.search_spike_ratio` (현재 1.5)   |
| `search_spike_any`     | 활성 키워드(`is_active=true`) 중 하나라도 `ratio_to_ma ≥ 1.5`                     | 동                                               |
| `compound`             | `cold_shock` AND (`first_freeze` OR `search_spike_hotpack` OR `search_spike_any`) | 뷰 정의 파생                                     |

> `ratio_to_ma` = 당일 검색지수 / 지난 7일 이동평균. 1.0 = 평시, 1.5 = 50% 급등.

---

## 3. 지표 공식 (`v_hotpack_trigger_effects`)

### 3.1 SQL 원본 (핵심만)

```sql
WITH unpvt AS (
  -- v_hotpack_triggers 의 5개 boolean 을 행 단위로 unpivot
  SELECT season, date, units_sold, 'cold_shock' AS trigger_key, cold_shock AS fired FROM v_hotpack_triggers
  UNION ALL ... (나머지 4종)
),
baseline AS (
  -- 시즌별 비발동일(cold_shock·first_freeze·search_spike_any 모두 false & units_sold>0) 평균
  SELECT season, ROUND(AVG(units_sold)) AS avg_normal
  FROM v_hotpack_triggers
  WHERE NOT cold_shock AND NOT first_freeze AND NOT search_spike_any AND units_sold > 0
  GROUP BY season
)
SELECT
  u.season, u.trigger_key,
  COUNT(*) FILTER (WHERE u.fired) AS fired_days,
  ROUND(AVG(u.units_sold) FILTER (WHERE u.fired)) AS avg_when_fired,
  b.avg_normal AS avg_baseline,
  ROUND(AVG(u.units_sold) FILTER (WHERE u.fired) / NULLIF(b.avg_normal, 0), 2) AS multiplier,
  ROUND(100.0 * COUNT(*) FILTER (
    WHERE u.fired AND u.units_sold > 0
      AND u.units_sold >= (SELECT t2.prev_units * 1.5 FROM v_hotpack_triggers t2
                            WHERE t2.date = u.date AND t2.season = u.season)
  ) / NULLIF(COUNT(*) FILTER (WHERE u.fired AND u.units_sold > 0), 0), 0) AS precision_pct
FROM unpvt u
LEFT JOIN baseline b USING (season)
GROUP BY u.season, u.trigger_key, b.avg_normal;
```

### 3.2 한국어 번역

- **`multiplier`** = 발동일 판매 평균 ÷ 비발동일(시즌 평범한 날) 판매 평균
- **`precision_pct`** = 발동일 중 "당일 판매 ≥ 전일 판매 × 1.5" 를 만족한 날의 비율 × 100

---

## 4. 25시즌 실측 데이터

### 4.1 cold_shock 7건 발동일

| 날짜       | Δ기온 | 최저기온 | 당일 판매 | 전일 대비                 |
| ---------- | ----- | -------- | --------- | ------------------------- |
| 2025-10-27 | −6.9℃ | 3.7℃     | 8,190     | +124%                     |
| 2025-11-02 | −6.8℃ | 3.7℃     | 9,186     | +86%                      |
| 2025-11-17 | −6.2℃ | −0.7℃    | 18,798    | +167% ← first_freeze 동시 |
| 2025-12-01 | −6.8℃ | 2.3℃     | 15,595    | +70%                      |
| 2025-12-02 | −7.7℃ | −5.4℃    | 29,078    | +86%                      |
| 2025-12-25 | −7.9℃ | −8.9℃    | 23,756    | +62%                      |
| 2026-01-19 | −6.1℃ | −9.8℃    | 20,905    | +85%                      |

7/7 전일 대비 1.5× 이상 판매 증가 → 정밀도 100%.

### 4.2 `search_spike_hotpack` 27일 전수 판정 표

"전일 대비 ≥ 1.5×" 기준으로 성공(✅) / 실패(❌):

| 날짜      | 기온   | 당일 판매 | 전일비    | 판정 |
| --------- | ------ | --------- | --------- | ---- |
| 9/9       | 21.4℃  | 249       | +41%      | ❌   |
| 9/22      | 17.6℃  | 80        | +95%      | ❌   |
| 9/29      | 16.6℃  | 194       | +24%      | ❌   |
| 10/10     | 16.0℃  | 383       | +14%      | ❌   |
| 10/13     | 13.9℃  | 717       | +93%      | ❌   |
| 10/14     | 14.4℃  | 813       | +13%      | ❌   |
| **10/20** | 5.3℃   | 3,700     | **+128%** | ✅   |
| 10/21     | 4.8℃   | 4,800     | +30%      | ❌   |
| 10/22     | 6.6℃   | 4,200     | −12%      | ❌   |
| **10/27** | 3.7℃   | 8,200     | **+124%** | ✅   |
| 10/28     | 3.0℃   | 8,900     | +8%       | ❌   |
| **11/17** | −0.7℃  | 18,800    | **+167%** | ✅   |
| 11/18     | −2.0℃  | 25,800    | +37%      | ❌   |
| 11/19     | −1.6℃  | 20,600    | −20%      | ❌   |
| 12/2      | −5.4℃  | 29,100    | +86%      | ❌   |
| 12/3      | −8.1℃  | 51,900    | +78%      | ❌   |
| 12/4      | −9.4℃  | 45,400    | −13%      | ❌   |
| 12/26     | −11.8℃ | 31,500    | +33%      | ❌   |
| 1/2       | −11.4℃ | 30,700    | +29%      | ❌   |
| 1/20      | −11.8℃ | 17,500    | −16%      | ❌   |
| 1/21      | −12.2℃ | 20,800    | +19%      | ❌   |
| 1/22      | −13.2℃ | 34,000    | +64%      | ❌   |
| 3/22      | 5.5℃   | 817       | +12%      | ❌   |
| 3/23      | 4.5℃   | 844       | +3%       | ❌   |
| 3/24      | 8.2℃   | 895       | +6%       | ❌   |
| 3/25      | 8.7℃   | 854       | −5%       | ❌   |
| 3/26      | 6.6℃   | 905       | +6%       | ❌   |

**결과**: 27일 중 3일(10/20·10/27·11/17) 성공 → 추가로 계산상 성공 포함해 정밀도 30%. 성공 3건 모두 cold_shock 또는 first_freeze 동시 발동일.

---

## 5. cold_shock 7건 — 검색량 동반 움직임

### 5.1 전날 대비 검색 증감

| 이벤트일   | D−1 검색 | D+0 검색 | 증감률   |
| ---------- | -------- | -------- | -------- |
| 2025-10-27 | 0.91     | 2.15     | +136%    |
| 2025-11-02 | 0.46     | 0.85     | +85%     |
| 2025-11-17 | 0.77     | 2.42     | +214%    |
| 2025-12-01 | 0.75     | 1.31     | +75%     |
| 2025-12-02 | 1.31     | 2.04     | +56%     |
| 2025-12-25 | 0.92     | 1.18     | +28%     |
| 2026-01-19 | 0.71     | 1.41     | +99%     |
| **평균**   | **0.83** | **1.62** | **+99%** |

7/7 증가, 중앙값 +85%, 범위 +28% ~ +214%.

### 5.2 이벤트 전후 평균 추이 (D−2 ~ D+3, 7건 평균)

| 상대일  | 검색 배수 | 최저기온  | 판매       |
| ------- | --------- | --------- | ---------- |
| D−2     | 0.75      | 4.9℃      | 7,113      |
| D−1     | 0.83      | 4.8℃      | 9,265      |
| **D+0** | **1.62**  | **−2.2℃** | **17,930** |
| **D+1** | **2.22**  | **−5.1℃** | **25,340** |
| D+2     | 1.81      | −4.0℃     | 23,613     |
| D+3     | 1.36      | −2.1℃     | 21,392     |

### 5.3 관찰

- **D−2·D−1 평균 < 1.0** — 트리거 이전엔 평시 이하, 선제 상승 없음
- **D+0 당일 +99% 급증**, **D+1에 피크 (2.22×)** — 당일·다음날 동반 증폭
- **D+3부터 평상화** — 이벤트 효과 약 3~4일 지속
- 선형 상관은 0(§1.2) 이지만, **cold_shock 조건부에선 7/7 재현** → 평상시 무반응, 이벤트 시 증폭의 threshold response 패턴

---

## 6. 임계값 시뮬레이션 (`search_spike_any` 기준)

25시즌에 각 임계값을 적용했을 경우:

| threshold       | 발동일 | 전일 대비 1.5× 성공 | 정밀도 | 발동일 평균 판매 | 비발동 평균 판매 | 배수 |
| --------------- | ------ | ------------------- | ------ | ---------------- | ---------------- | ---- |
| **1.5×** (현행) | 30일   | 8일                 | 27%    | 12,113           | 6,230            | 1.94 |
| **2.0×**        | 20일   | 6일                 | 30%    | 11,753           | 6,574            | 1.79 |
| **2.5×**        | 10일   | 3일                 | 30%    | 9,115            | 6,961            | 1.31 |
| **3.0×**        | 6일    | 2일                 | 33%    | 10,496           | 6,962            | 1.51 |

1.5 → 3.0으로 올릴수록 발동 수 급감, 정밀도 27→33% (3%p), 배수 1.94→1.51 (하락).

---

## 7. 운영

### 7.1 임계값 변경

```sql
UPDATE trigger_config
SET threshold = '2.0', updated_at = NOW()
WHERE trigger_key = 'search_spike_ratio';
```

`v_hotpack_trigger_effects` 는 뷰라 다음 조회부터 즉시 재계산됨. 과거 시즌 수치도 재계산되므로 시즌 간 비교가 필요하면 변경 전 값을 별도 기록.

### 7.2 키워드 활성/비활성

```sql
UPDATE keyword_catalog SET is_active = false WHERE keyword = '...';
```

`v_keyword_daily_with_ma` 와 `search_spike_any` 가 `is_active=true` 기준으로 필터링하므로 즉시 반영.

### 7.3 검증 SQL 스니펫

```sql
-- 시즌별 5종 트리거 집계
SELECT trigger_key, fired_days, multiplier, precision_pct
FROM v_hotpack_trigger_effects
WHERE season = '25시즌'
ORDER BY fired_days DESC;

-- 특정 날짜의 트리거 상세
SELECT date, cold_shock, compound, first_freeze,
       search_spike_hotpack, search_spike_any,
       tmin_delta, temp_min, units_sold, prev_units,
       max_keyword_ratio, spiked_keywords
FROM v_hotpack_triggers
WHERE season = '25시즌' AND date = '2025-11-17';

-- cold_shock 전후 lag 추이 재생산
WITH cs AS (
  SELECT date FROM v_hotpack_triggers WHERE season = '25시즌' AND cold_shock
)
SELECT (t.date - cs.date) AS lag,
       ROUND(AVG(t.max_keyword_ratio)::numeric, 2) AS avg_ratio,
       ROUND(AVG(t.temp_min)::numeric, 2) AS avg_tmin,
       ROUND(AVG(t.units_sold)) AS avg_sales
FROM cs
JOIN v_hotpack_triggers t
  ON t.date BETWEEN cs.date - 2 AND cs.date + 3 AND t.season = '25시즌'
WHERE t.max_keyword_ratio IS NOT NULL
GROUP BY lag ORDER BY lag;
```

---

## 8. 한계 명시

- **샘플 1개 시즌 (212일)** — 통계적 파워 제한
- **활성 키워드 2개** ("손난로"·"핫팩" 범용어) — 구체 상품·롱테일 미커버
- **선형 분석** — 비선형·조건부 관계는 별도 분석 필요
- **외생 변수 미통제** — 프로모션·공휴일·광고 영향 분리 안 됨

---

## 9. 관련 문서

| 파일                          | 역할                             |
| ----------------------------- | -------------------------------- |
| `HOTPACK_SEASON.md`           | 자산 카탈로그·cron·로드맵        |
| `HOTPACK_DASHBOARD_LAYOUT.md` | `/analytics/weatherkey` 레이아웃 |
| `VISUAL_REFERENCE.md`         | 시각 토큰                        |
| `hotpack_season_runbook.md`   | 운영 매뉴얼·LLM 프롬프트         |

---

## 변경 이력

- 2026-04-21: 초안 재구성. 실측 숫자·공식·샘플 중심으로 단순화. 추측성 섹션(구조적 약함 해석·개선 제안)은 제거. (PM 지호)
