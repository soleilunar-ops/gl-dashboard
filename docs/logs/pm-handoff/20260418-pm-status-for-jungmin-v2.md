# GL Supabase 연동 진행 상황 보고 (PM → 정민)

작성자: 김지호 (PM)
작성일: 2026-04-18
대상: 정민 (수요 예측 파트)
관련 문서:

- `20260417-jungmin-feature-data-map.md` (정민 원본)
- `20260417-for-jungmin-human-v2.md` / `20260417-for-jungmin-ai-v2.md` (PM 지시서 v2)
- `20260418-jungmin-pm-decisions.md` (정민 의사결정 회신)

---

## 0. 3줄 요약

1. 정민 의사결정 5개 중 **PM 영역 4개 모두 Supabase 반영 완료** (테이블 4개 + 뷰 1개 생성)
2. **데이터는 아직 안 넣음**. 정민이 넣을 차례 (v2 실무 진행 순서 3~6번)
3. **바이박스 데이터에 PK 중복 16건 이슈 있음** — 정민 결정 필요

---

## 1. Supabase 현재 상태

### 1.1 신규 생성된 테이블 4개 (전부 0행)

요약표 (상세 컬럼은 섹션 2에):

| 테이블              | PK                                  | RLS           | 행 수 |
| ------------------- | ----------------------------------- | ------------- | ----: |
| `bi_box_daily`      | (date, sku_id, vendor_item_id)      | authenticated |     0 |
| `forecast_model_a`  | (sku_id, week_start, model_version) | authenticated |     0 |
| `forecast_model_b`  | id (bigserial) + 유니크 인덱스      | authenticated |     0 |
| `winter_validation` | id (bigserial)                      | authenticated |     0 |

### 1.2 신규 생성된 뷰 1개

**`v_weather_hybrid`** — 정민의 하이브리드 날씨 전략을 SQL로 구현. ASOS의 온도/바람 + ERA5의 강수/눈을 자동 조인.

검증 결과: 2025-11-01 ~ 2026-03-31 겨울 755행 중 temp 100% · wind 99.3% · rain 100% · snowfall 100%.

pandas merge 코드 불필요. 이 뷰만 SELECT하면 됨.

---

## 2. 테이블 전체 컬럼 스펙 (정민 INSERT 스크립트 작성용)

### 2.1 `bi_box_daily`

**테이블 설명**: 쿠팡 Supplier Hub > Supply Analysis 엑셀에서 추출한 일별 바이박스 분석 데이터. `sku_master`와 독립 (바이박스 SKU 범위가 넓어서 FK 미설정).

**PK**: `(date, sku_id, vendor_item_id)`

| 컬럼               | 타입        |   NULL   | Default | 설명                                                                     |
| ------------------ | ----------- | :------: | ------- | ------------------------------------------------------------------------ |
| date               | date        | NOT NULL | -       | PK                                                                       |
| sku_id             | text        | NOT NULL | -       | PK · 쿠팡 SKU ID (FK 미설정)                                             |
| sku_name           | text        |   NULL   | -       | 쿠팡 SKU 이름                                                            |
| vendor_item_id     | text        | NOT NULL | -       | PK · 쿠팡 벤더 아이템 ID                                                 |
| vendor_item_name   | text        |   NULL   | -       | 벤더 아이템 이름                                                         |
| min_price          | numeric     |   NULL   | -       | 최저가                                                                   |
| mid_price          | numeric     |   NULL   | -       | 중간가                                                                   |
| max_price          | numeric     |   NULL   | -       | 최고가                                                                   |
| bi_box_share       | numeric     |   NULL   | -       | 바이박스 점유율 (0-100 숫자. 원본 '100.0000%' 문자열을 숫자로 변환 필요) |
| is_stockout        | boolean     |   NULL   | false   | 재고 없음 여부                                                           |
| unit_price_ok      | boolean     |   NULL   | false   | 단위가격 조건 충족 여부                                                  |
| per_piece_price_ok | boolean     |   NULL   | false   | 개당가격 조건 충족 여부                                                  |
| attribute_error    | boolean     |   NULL   | false   | 상품속성 오류                                                            |
| source_file        | text        |   NULL   | -       | 업로드 원본 파일명 (추적용)                                              |
| created_at         | timestamptz |   NULL   | now()   | 자동 기록                                                                |

**CSV ↔ DB 컬럼 매핑**:

| 쿠팡 CSV 컬럼   | DB 컬럼            | 변환                                          |
| --------------- | ------------------ | --------------------------------------------- |
| 날짜            | date               | `YYYYMMDD` → `YYYY-MM-DD`                     |
| SKU ID          | sku_id             | 그대로                                        |
| SKU Name        | sku_name           | 그대로                                        |
| 벤더아이템 ID   | vendor_item_id     | 그대로                                        |
| VIID 명         | vendor_item_name   | 그대로                                        |
| 최저가          | min_price          | 문자열 → float                                |
| 중간가          | mid_price          | 문자열 → float                                |
| 최고가          | max_price          | 문자열 → float                                |
| 바이박스 점유율 | bi_box_share       | `'100.0000%'` → `100.0` (rstrip '%' 후 float) |
| 재고 없음       | is_stockout        | `'true'`/`'false'` → bool                     |
| 단위가격 조건   | unit_price_ok      | `'true'`/`'false'` → bool                     |
| 개당가격 조건   | per_piece_price_ok | `'true'`/`'false'` → bool                     |
| 상품속성 오류   | attribute_error    | `'true'`/`'false'` → bool                     |

---

### 2.2 `forecast_model_a`

**테이블 설명**: Model A (LightGBM) 주간 SKU 판매 예측. `model_version`으로 round1~round4 등 배치 구분.

**PK**: `(sku_id, week_start, model_version)`
**FK**: `sku_id` → `sku_master.sku_id`

| 컬럼                      | 타입        |   NULL   | Default  | 설명                                                |
| ------------------------- | ----------- | :------: | -------- | --------------------------------------------------- |
| sku_id                    | text        | NOT NULL | -        | PK · FK → sku_master                                |
| week_start                | date        | NOT NULL | -        | PK · 예측 대상 주의 시작일 (월요일 권장)            |
| model_version             | text        | NOT NULL | 'round4' | PK · 모델 배치 버전                                 |
| weekly_sales_qty_forecast | numeric     | NOT NULL | -        | 주간 판매량 예측값                                  |
| lower_bound               | numeric     |   NULL   | -        | 신뢰구간 하한 (미사용 시 NULL)                      |
| upper_bound               | numeric     |   NULL   | -        | 신뢰구간 상한                                       |
| confidence_interval       | numeric     |   NULL   | 0.95     | 신뢰수준                                            |
| features_used             | jsonb       |   NULL   | -        | 사용된 피처 리스트 (예: `["lag_1","cold_days_7d"]`) |
| used_synthetic            | boolean     |   NULL   | false    | 합성 2024 학습 여부                                 |
| generated_at              | timestamptz |   NULL   | now()    | 자동 기록                                           |

---

### 2.3 `forecast_model_b`

**테이블 설명**: Model B (비율 기반) 카테고리+SKU 발주 예측. `sku_id`가 NULL이면 카테고리 총량 row, 값 있으면 SKU 분배량 row.

**PK**: `id` (bigserial)
**UNIQUE INDEX**: `(week_start, product_category, COALESCE(sku_id, ''), model_version)` — NULL sku_id 중복 방지
**FK**: `sku_id` → `sku_master.sku_id`

| 컬럼             | 타입        |   NULL   | Default | 설명                               |
| ---------------- | ----------- | :------: | ------- | ---------------------------------- |
| id               | bigserial   | NOT NULL | auto    | PK                                 |
| week_start       | date        | NOT NULL | -       | 예측 대상 주                       |
| product_category | text        | NOT NULL | -       | 카테고리 (예: Home)                |
| sku_id           | text        |   NULL   | -       | NULL=카테고리 row, 값=SKU 분배 row |
| pred_ratio       | numeric     |   NULL   | -       | 비율 기반 예측값                   |
| pred_linear      | numeric     |   NULL   | -       | 선형 기반 예측값                   |
| distributed_qty  | numeric     |   NULL   | -       | SKU 분배량 (sku_id 있을 때만)      |
| model_version    | text        | NOT NULL | 'v1'    | 모델 버전                          |
| lookback_weeks   | integer     |   NULL   | 4       | 비율 계산 기준 과거 N주            |
| distribute_weeks | integer     |   NULL   | 2       | SKU 분배 기준 주 수                |
| used_synthetic   | boolean     |   NULL   | false   | 합성 2024 학습 여부                |
| generated_at     | timestamptz |   NULL   | now()   | 자동 기록                          |

**INSERT 패턴**:

- 카테고리 row: `sku_id=NULL`, `pred_ratio`/`pred_linear` 채움
- SKU row: `sku_id`에 값, `distributed_qty` 채움

---

### 2.4 `winter_validation`

**테이블 설명**: 겨울 검증 결과. `grain`으로 weekly/sku/summary 3레벨 구분. `run_id`로 검증 실행 구분.

**PK**: `id` (bigserial)
**FK**: `sku_id` → `sku_master.sku_id`
**CHECK**: `grain IN ('weekly','sku','summary')`

| 컬럼                 | 타입        |   NULL   | Default | 용도 grain                             |
| -------------------- | ----------- | :------: | ------- | -------------------------------------- |
| id                   | bigserial   | NOT NULL | auto    | PK                                     |
| run_id               | text        | NOT NULL | -       | 검증 실행 ID (타임스탬프 기반 권장)    |
| grain                | text        | NOT NULL | -       | `'weekly'` / `'sku'` / `'summary'`     |
| week_start           | date        |   NULL   | -       | weekly일 때 사용                       |
| sku_id               | text        |   NULL   | -       | sku일 때 사용                          |
| actual               | numeric     |   NULL   | -       | 실제 판매량 (weekly/sku)               |
| predicted            | numeric     |   NULL   | -       | 예측 판매량 (weekly/sku)               |
| abs_error            | numeric     |   NULL   | -       | 절대 오차 (weekly/sku)                 |
| error_pct            | numeric     |   NULL   | -       | 오차율 (weekly)                        |
| bias                 | numeric     |   NULL   | -       | 편향 (weekly)                          |
| overall_mae          | numeric     |   NULL   | -       | 전체 MAE (summary만)                   |
| winter_mae           | numeric     |   NULL   | -       | 겨울 MAE (summary만)                   |
| val_mae_no_synthetic | numeric     |   NULL   | -       | 합성 제외 모델 MAE (summary만, 비교용) |
| used_synthetic       | boolean     |   NULL   | false   | 이 row 모델의 합성 학습 여부           |
| notes                | text        |   NULL   | -       | 메모                                   |
| generated_at         | timestamptz |   NULL   | now()   | 자동 기록                              |

**grain별 INSERT 예시**:

- `weekly`: run_id, grain='weekly', week_start, actual, predicted, abs_error, error_pct, bias
- `sku`: run_id, grain='sku', sku_id, actual, predicted, abs_error
- `summary`: run_id, grain='summary', overall_mae, winter_mae, val_mae_no_synthetic, notes

---

### 2.5 `v_weather_hybrid` (뷰)

**용도**: 정민 Model A/B 학습 입력. pandas merge 불필요.

**컬럼** (16개):

| 컬럼              | 타입    | 소스                            |
| ----------------- | ------- | ------------------------------- |
| weather_date      | date    | 공통                            |
| station           | text    | 공통 (서울/수원/대전/광주/부산) |
| lat               | numeric | 공통                            |
| lon               | numeric | 공통                            |
| temp_avg          | numeric | ASOS                            |
| temp_min          | numeric | ASOS                            |
| temp_max          | numeric | ASOS                            |
| wind_avg          | numeric | ASOS                            |
| wind_direction    | numeric | ASOS                            |
| rain              | numeric | ERA5                            |
| precipitation     | numeric | ERA5                            |
| snowfall          | numeric | ERA5                            |
| apparent_temp_avg | numeric | ERA5                            |
| apparent_temp_min | numeric | ERA5                            |
| apparent_temp_max | numeric | ERA5                            |
| humidity_avg      | numeric | ERA5                            |

**관측소 ID ↔ 이름 매핑** (정민 기존 코드가 숫자 ID 사용 시 필요):

| KMA ID | station (뷰에서 반환되는 값) |
| ------ | ---------------------------- |
| 108    | 서울                         |
| 119    | 수원                         |
| 133    | 대전                         |
| 156    | 광주                         |
| 159    | 부산                         |

---

## 3. 정민 의사결정 5개 반영 상태

| #   | 결정 내용                | PM 작업                           | 상태                               |
| --- | ------------------------ | --------------------------------- | ---------------------------------- |
| ①   | 하이브리드 날씨          | `v_weather_hybrid` 뷰 생성        | ✅ 완료                            |
| ②   | 바이박스 주 단위 배치    | `bi_box_daily` 테이블 생성        | 🟡 테이블 준비됨. 정민 INSERT 대기 |
| ③   | model_version 유지       | 두 forecast 테이블에 컬럼 포함    | ✅ 완료                            |
| ④   | 합성 2024 로컬 유지      | Supabase에 합성 테이블 생성 안 함 | ✅ 완료                            |
| ⑤   | 지역 가중 seoul_dominant | DDL 영역 밖 (코드에서 처리)       | ⚠️ 정민 코드 작업                  |

추가 요청 사항: `v_weather_hybrid` 뷰 제작 — ✅ 완료

---

## 4. 바이박스 데이터 이슈 (정민 결정 필요)

정민이 준 5개 CSV(2025-12 ~ 2026-04) 총 28,768행 분석 결과:

### 4.1 PK 중복 89건

| 유형      | 건수 | 성격                                                                |
| --------- | ---: | ------------------------------------------------------------------- |
| 순수 중복 |   73 | 쿠팡 원본 엑셀이 완전히 같은 row를 두 번 출력                       |
| 시점 중복 |   16 | 같은 PK인데 `bi_box_share` 값만 다름 (예: 54.17% + 45.83% = 100.0%) |

**순수 중복 73건**: dedup 시 자동 제거 (값 동일하므로 정보 손실 없음)

**시점 중복 16건 처리 방식 결정 필요**:

| 옵션 | 방식                                    | 장점                     | 단점                               |
| ---- | --------------------------------------- | ------------------------ | ---------------------------------- |
| A    | PK에 `seq_no` 컬럼 추가 (DDL 변경 필요) | 원본 완전 보존           | 일별 단일값 피처로 쓸 때 집계 필요 |
| B    | `bi_box_share` 평균 처리 후 1행         | 데이터 단순, 피처화 쉬움 | 시간대별 변동 정보 손실            |
| C    | `bi_box_share` 최대값 유지 후 1행       | 피크 점유율 보존         | 다른 구간 정보 버림                |

**PM 추천: B (평균)**. 대부분의 ML 피처가 일별 단일값이고, 시간대별 분석은 정민 파트 요구사항이 아님.

### 4.2 FK 미설정 관련 주의

- 바이박스 `sku_id`에 FK가 없음
- `sku_master`에 없는 18개 SKU도 그대로 INSERT 가능
- `sku_master`와 JOIN 시 LEFT JOIN 필수

---

## 5. 정민이 해야 할 일

### 5.1 즉시 필요한 결정

**결정 1: PK 중복 16건 처리 방식 (A/B/C 중 선택)**

- PM 추천 B (평균)
- 선택 안 하면 INSERT가 에러로 실패하므로 필수

### 5.2 작업 리스트 (v2 AI 지시서 기준)

**Step 1: 바이박스 백필 업로드**

스크립트 작성:

```
입력: 5개 CSV 파일
처리:
  1. PK 중복 89건 dedup (결정 1 반영)
  2. bi_box_share 파싱 (문자열 → 숫자)
  3. boolean 필드 파싱
  4. 날짜 변환 (YYYYMMDD → YYYY-MM-DD)
출력: bi_box_daily INSERT (150~200행/배치 권장)
```

**Step 2: 로컬 CSV 읽기 → Supabase 쿼리 전환**

대상 파일:

- `services/api/analytics/weekly_demand_forecast.py`
- `services/api/data_pipeline/open_meteo_ecmwf.py`
- `services/api/analytics/order_response_model.py`

변경 내용:

- ASOS 캐시 CSV → `v_weather_hybrid` 뷰 SELECT (pandas merge 불필요)
- Open-Meteo 실시간 호출 → `weather_unified WHERE source='forecast'`
- 납품률 xlsx → `noncompliant_delivery` 테이블

**Step 3: Model A/B 산출물 UPSERT 로직 추가**

각 배치 종료 시 Supabase 저장:

- Model A → `forecast_model_a`
- Model B → `forecast_model_b` (카테고리 + SKU 두 유형)
- 겨울 검증 → `winter_validation` (weekly/sku/summary 3 grain)

주의: `used_synthetic=true/false`를 명시적으로 전달 (합성 학습 여부 기록)

**Step 4: FastAPI 엔드포인트 전환**

대상 엔드포인트 4개:

- `/forecast/weekly-prediction` → `forecast_model_a`
- `/forecast/winter-analysis` → `winter_validation` (grain='weekly')
- `/forecast/order-simulation` → `forecast_model_b`
- `/forecast/insight` → 여러 테이블 조합 + OpenAI

**Step 5: E2E 테스트**

- 배치 1회 실행 후 `data_sync_log` 기록 확인
- 대시보드 브라우저 접근 후 카드 4종 확인
- MAE 등 수치가 로컬 결과와 일치하는지 비교

---

## 6. 참고: Supabase 접근 예시 코드

```python
import os
import pandas as pd
from supabase import create_client, Client

# .env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 필요
# anon key로는 RLS authenticated 정책 때문에 데이터 안 보임
supabase: Client = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_ROLE_KEY"]
)

# 1. v_weather_hybrid 조회 예시
response = supabase.table("v_weather_hybrid") \
    .select("*") \
    .gte("weather_date", "2025-11-01") \
    .lte("weather_date", "2026-03-31") \
    .execute()
weather_df = pd.DataFrame(response.data)

# 2. 바이박스 INSERT 예시 (dedup 후)
records = [
    {
        "date": "2025-12-01",
        "sku_id": "41856",
        "sku_name": "하루온팩 손난로 80g 10 개",
        "vendor_item_id": "76493820036",
        "vendor_item_name": "하루온 손난로 핫팩 80g,10개,10개",
        "min_price": 4330.0,
        "mid_price": 4330.0,
        "max_price": 4360.0,
        "bi_box_share": 100.0,
        "is_stockout": False,
        "unit_price_ok": False,
        "per_piece_price_ok": False,
        "attribute_error": False,
        "source_file": "바이박스분석_2025년12월_.csv",
    },
    # ... (dedup된 28,679행)
]
BATCH = 200
for i in range(0, len(records), BATCH):
    supabase.table("bi_box_daily").insert(records[i:i+BATCH]).execute()

# 3. forecast_model_a UPSERT 예시
supabase.table("forecast_model_a").upsert([
    {
        "sku_id": "41856",
        "week_start": "2026-04-20",
        "model_version": "round4",
        "weekly_sales_qty_forecast": 1234.5,
        "features_used": ["lag_1", "lag_2", "cold_days_7d"],
        "used_synthetic": True,
    }
]).execute()

# 4. winter_validation INSERT 예시 (3 grain)
run_id = "run_20260418_0900"
supabase.table("winter_validation").insert([
    # weekly grain
    {"run_id": run_id, "grain": "weekly", "week_start": "2025-12-01",
     "actual": 4500, "predicted": 4200, "abs_error": 300,
     "error_pct": 6.67, "bias": -300, "used_synthetic": True},
    # sku grain
    {"run_id": run_id, "grain": "sku", "sku_id": "41856",
     "actual": 300, "predicted": 280, "abs_error": 20, "used_synthetic": True},
    # summary grain
    {"run_id": run_id, "grain": "summary",
     "overall_mae": 1697, "winter_mae": 2143, "val_mae_no_synthetic": 2400,
     "used_synthetic": True, "notes": "합성 포함 round4 모델"},
]).execute()
```

---

## 7. PM 다음 할 일

정민 결정/요청 있을 때 대응:

- [ ] PK 중복 처리 방식 결정 받으면 관련 DDL 수정 (옵션 A 선택 시만)
- [ ] 바이박스 자동화 필요 시 GitHub Actions 워크플로 초안 작성
- [ ] Step 1~5 진행 중 막힘 생기면 디버깅 지원

---

끝.
