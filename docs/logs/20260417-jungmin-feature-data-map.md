# 기능별 사용 데이터 매핑 (2026-04-17 정민)

## 목적

수요 예측 대시보드에서 **각 기능이 어떤 파일/출처의 어떤 컬럼을 사용하는지**를 PM·팀원이 한 눈에 파악할 수 있도록 정리.

---

## 1. 전체 요약 매트릭스

| 기능                  | daily_performance | ASOS | Open-Meteo | 바이박스 | 납품률 xlsx | 지역트렌드 | 합성 2024 | 구현 파일                                                |
| --------------------- | :---------------: | :--: | :--------: | :------: | :---------: | :--------: | :-------: | -------------------------------------------------------- |
| ① Model A (LightGBM)  |        ✅         |  ✅  |     ✅     |    ✅    |      -      |     -      |    ✅     | `services/api/analytics/weekly_demand_forecast.py`       |
| ② Model B (비율 발주) |        ✅         |  -   |     -      |    -     |     ✅      |     -      |    ✅     | `services/api/analytics/order_response_model.py`         |
| ③ AI 발주 인사이트    |        ✅         |  ✅  |     ✅     |    ✅    |      -      |     -      |     -     | `services/api/analytics/insight_generator.py`            |
| ④ 겨울 검증           |        ✅         |  ✅  |     -      |    ✅    |      -      |     -      |    ✅     | `services/api/analytics/winter_validation.py`            |
| ⑤ 합성 2024 생성      |        ✅         |  ✅  |     -      |    -     |     ✅      |     ✅     |     -     | `services/api/data_pipeline/synthetic_data_generator.py` |
| ⑥ 대시보드 화면       |        ✅         |  ✅  |     ✅     |    ✅    |      -      |     -      |     -     | `src/components/analytics/forecast/*`                    |
| ⑦ 포장 단위 분석      |        ✅         |  -   |     -      |    -     |      -      |     -      |     -     | `services/api/routers/forecast.py::pack-distribution`    |

---

## 2. 기능별 상세

### ① Model A — LightGBM 주간 수요 예측

**목적**: SKU × 주 단위 판매량 예측 (34개 핫팩 SKU, 향후 4~12주)

**데이터 소스**

| 소스             | 위치                                       | 사용 컬럼                                                                          | 용도                                |
| ---------------- | ------------------------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------- |
| 쿠팡 일간성과    | Supabase `daily_performance`               | `sale_date`, `sku_id`, `units_sold`                                                | 주간 집계 → 타겟 `weekly_sales_qty` |
| 쿠팡 일간성과    | 위와 동일                                  | `weekly_min_price` (파생)                                                          | 가격 피처                           |
| 기상청 ASOS      | `data/processed/asos_weather_cache.csv`    | `date`, `temp_mean`, `temp_min`, `temp_max`, `rain_mm`, `snow_cm`, `wind_mean`     | 날씨 피처 (학습)                    |
| Open-Meteo ECMWF | `https://api.open-meteo.com/v1/ecmwf`      | `temperature_2m_max/min`, `precipitation_sum`, `windspeed_10m_max`, `snowfall_sum` | 미래 날씨 피처 (추론, 0~15일)       |
| 바이박스 CSV     | `data/raw/coupang/bi_box/*.csv`            | `sku`, `date`, `price`, `is_stockout`                                              | 가격·품절 피처                      |
| 합성 2024        | `data/processed/synthetic_2024_weekly.csv` | 전 컬럼                                                                            | 학습 데이터 증강 (66주)             |

**파생 피처 (14개)**

- `weekly_sales_qty_lag_1/2/4` (시계열 lag)
- `cold_days_7d` (최근 7일 중 최저기온 -12℃ 이하 일수)
- `temp_range` (주간 일교차)
- `first_snow_flag` (첫눈 주 플래그)
- `weekly_bi_box_share_mean` (바이박스 점유율 평균)
- `weekly_stockout_flag` (품절 발생 여부)
- `promotion_flag` (프로모션 적용 여부, 현재는 0)

**산출물**: `data/processed/forecast_latest.csv`, `forecast_round4.csv`

---

### ② Model B — 비율 기반 발주량 추정

**목적**: 카테고리 전체 발주량 예측 + SKU별 분배

**데이터 소스**

| 소스          | 위치                                                | 사용 컬럼                                                 | 용도                          |
| ------------- | --------------------------------------------------- | --------------------------------------------------------- | ----------------------------- |
| 쿠팡 일간성과 | Supabase `daily_performance`                        | `sale_date`, `sku_id`, `units_sold`                       | 직전 N주 판매 비율 (SKU 분배) |
| 납품률 xlsx   | `data/raw/logistics/납품률(20250413-20260418).xlsx` | `Week of Delivery`, `Units Requested`, `Product Category` | 발주/판매 실측 배수 계산      |
| 합성 2024     | `data/processed/synthetic_2024_delivery.csv`        | `week_start`, `category_order_qty`                        | 학습 샘플 증강                |

**핵심 파라미터 (튜닝 결과)**

- `ratio_lookback_weeks=4` (직전 4주 평균으로 비율 계산)
- `sku_distribute_weeks=2` (SKU 분배 기준 주 수)

**산출물**: `data/processed/model_b_category_forecast.csv`, `model_b_sku_distribution.csv`

---

### ③ AI 발주 인사이트 (GPT-4o-mini)

**목적**: Model A/B 결과를 3~5줄 자연어 권장문으로 변환

**데이터 소스**

| 소스               | 위치                                            | 사용 컬럼 / 내용                                 | 용도              |
| ------------------ | ----------------------------------------------- | ------------------------------------------------ | ----------------- |
| Model A 출력       | `data/processed/forecast_round4.csv`            | `sku`, `week_start`, `weekly_sales_qty_forecast` | 상위 5 SKU 예측치 |
| Model B 출력       | `data/processed/model_b_category_forecast.csv`  | `week_start`, `pred_ratio`, `pred_linear`        | 발주 기준량       |
| 날씨 캐시          | `data/processed/asos_weather_cache.csv`         | `date`, `temp_mean`, `temp_min`, `rain_mm`       | 최근 7일 요약     |
| 바이박스           | `data/raw/coupang/bi_box/*.csv`                 | `sku`, `name`, `is_stockout`                     | 제품명·품절률     |
| 카테고리 월별 계수 | `insight_generator.py::CATEGORY_MONTHLY_FACTOR` | 4 카테고리 × 12월 매트릭스                       | 시즌 조정         |
| 검증 결과          | `data/processed/winter_validation_result.json`  | `A_no_synthetic.val_mae`                         | 신뢰구간          |

**출력 공식**

```
권장 발주량 = 기준량 × (제품 비중% / 100) × 제품의 월별 계수

기준량 = Model B 예상 발주요청량 (없으면 Model A 총량 × 0.6)
```

**API**: `GET /forecast/insight`

---

### ④ 겨울 검증

**목적**: 합성+실 결합 모델의 2025-10~2026-04 실측 대비 정확도 평가

**데이터 소스**

| 소스          | 위치                                       | 사용 컬럼                           | 용도                |
| ------------- | ------------------------------------------ | ----------------------------------- | ------------------- |
| 쿠팡 일간성과 | Supabase `daily_performance`               | `sale_date`, `sku_id`, `units_sold` | Ground truth (실측) |
| 기상청 ASOS   | `data/processed/asos_weather_cache.csv`    | 전 컬럼                             | 검증 구간 날씨      |
| 바이박스      | `data/raw/coupang/bi_box/*.csv`            | `sku`, `is_stockout`                | 검증 구간 품절      |
| 합성 2024     | `data/processed/synthetic_2024_weekly.csv` | 전 컬럼                             | 학습 세트 구성      |

**결과 컬럼**: `week_start`, `actual`, `predicted`, `abs_error`, `error_pct`, `bias`

**산출물**: `data/processed/winter_analysis_weekly.csv`, `winter_analysis_by_sku.csv`, `winter_analysis_summary.json`

**현재 성능**: 전체 MAE **1,697** / 겨울(11~1월) MAE **2,143**

---

### ⑤ 합성 2024 데이터 생성

**목적**: 1년치 실데이터의 겨울 샘플 부족 보완 (학습 전용)

**데이터 소스**

| 소스               | 위치                                    | 사용 컬럼                                   | 용도                                 |
| ------------------ | --------------------------------------- | ------------------------------------------- | ------------------------------------ |
| 쿠팡 일간성과 2025 | Supabase `daily_performance`            | 전 컬럼                                     | 체감온도 구간별 민감도 회귀계수 추출 |
| 기상청 ASOS 2024   | `data/processed/asos_weather_cache.csv` | `date`, `temp_mean`, `wind_mean`, `snow_cm` | 2024년 실날씨 주입                   |
| 지역별 트렌드      | `data/raw/coupang/regional_trend/*.csv` | 지역별 판매 비중                            | 지역 가중치 (수도권 61.5%)           |
| 납품률 xlsx        | `data/raw/logistics/납품률*.xlsx`       | `Week of Delivery`, `Units Requested`       | 월별 발주/판매 배수                  |
| 기상청 발표        | 외부 (2024-11-27 첫 한파)               | 날짜 1개                                    | 첫 한파 플래그                       |
| JAG/TI 2001 공식   | 기상청 공식                             | 수식                                        | 체감온도 계산                        |
| Lee & Zheng 2024   | 논문 (JAERE)                            | -5℃ 임계                                    | 급강하 효과                          |

**산출물**: `data/processed/synthetic_2024_weekly.csv` (2,244행, 34 SKU × 66주), `synthetic_2024_delivery.csv`

---

### ⑥ 대시보드 화면 (Next.js)

**목적**: 예측·인사이트·발주 시뮬레이션을 웹 UI로 시각화

**구성 카드 및 데이터 매핑**

| 카드                        | FastAPI 엔드포인트                | 소스                                                           |
| --------------------------- | --------------------------------- | -------------------------------------------------------------- |
| AI 인사이트                 | `GET /forecast/insight`           | 기능 ③ 참조                                                    |
| 누적 판매 / GMV             | `GET /forecast/daily-sales`       | `daily_performance` (34 SKU 합산)                              |
| 다음 주 예측 수량           | `GET /forecast/weekly-prediction` | `winter_analysis_weekly.csv` + `model_b_category_forecast.csv` |
| 주별 판매 추이 및 예측 차트 | 위 두 엔드포인트 병합             | 과거 27주(winter) + 미래 3주(model_b)                          |
| 겨울 검증 카드              | `GET /forecast/winter-analysis`   | `winter_analysis_weekly.csv`                                   |
| 포장 단위별 판매 분포       | `GET /forecast/pack-distribution` | 기능 ⑦ 참조                                                    |
| 발주 시뮬레이션 테이블      | `GET /forecast/order-simulation`  | `model_b_sku_distribution.csv`                                 |

**구현 파일**

- 프론트: `src/components/analytics/forecast/ForecastDashboard.tsx`, `_hooks/useForecast.ts`
- 백엔드: `services/api/routers/forecast.py`

---

### ⑦ 포장 단위별 판매 분포 (지엘 납품 포장 전환 대비)

**목적**: 각 카테고리별 소비자 구매 옵션(포장 단위) 판매 비중 파악

**데이터 소스**

| 소스          | 위치                         | 사용 컬럼                        | 용도                         |
| ------------- | ---------------------------- | -------------------------------- | ---------------------------- |
| 쿠팡 일간성과 | Supabase `daily_performance` | `vendor_item_name`, `units_sold` | 제품명에서 "N개" 정규식 파싱 |

**카테고리 분류 (제품명 키워드)**

- "붙이는" / "패치" / "파스" → **붙이는 핫팩** (의료용)
- "찜질" → **찜질팩**
- "손난로" / "군인" / "보온대" → **손난로**
- 그 외 → **일반 핫팩**

**산출물**: `GET /forecast/pack-distribution` JSON 응답 (카테고리 × 포장단위 × 판매량 × 비중)

---

## 3. 데이터 소스 상세 부록

### A. Supabase `daily_performance` (12,492행, 2025-04 ~ 2026-04)

**29개 컬럼 전체**

| 컬럼                                                           | 타입      | 설명               |
| -------------------------------------------------------------- | --------- | ------------------ |
| id                                                             | int       | PK                 |
| sale_date                                                      | date      | 판매일             |
| sku_id                                                         | varchar   | 쿠팡 SKU ID        |
| vendor_item_id                                                 | varchar   | 벤더 아이템 ID     |
| vendor_item_name                                               | varchar   | 제품명             |
| gmv                                                            | float     | 총 매출액          |
| units_sold                                                     | int       | 판매 수량          |
| return_units                                                   | int       | 반품 수량          |
| cogs                                                           | float     | 매출원가           |
| amv                                                            | float     | 실 매출액          |
| asp                                                            | float     | 평균 판매가        |
| coupon_discount                                                | float     | 쿠폰 할인          |
| coupang_extra_discount                                         | float     | 쿠팡 추가 할인     |
| instant_discount                                               | float     | 즉시 할인          |
| promo_gmv                                                      | float     | 프로모션 GMV       |
| promo_units_sold                                               | int       | 프로모션 판매 수량 |
| order_count                                                    | int       | 주문 수            |
| customer_count                                                 | int       | 고객 수            |
| avg_spend_per_customer                                         | float     | 고객당 평균 지출   |
| conversion_rate                                                | float     | 전환율 (%)         |
| page_views                                                     | int       | 조회수             |
| sns_gmv, sns_cogs, sns_ratio, sns_units_sold, sns_return_units | float/int | SNS 매출 관련      |
| review_count                                                   | int       | 리뷰 수            |
| avg_rating                                                     | float     | 평균 평점          |
| created_at                                                     | timestamp | 레코드 생성 시각   |

**현재 사용 컬럼**: `sale_date`, `sku_id`, `vendor_item_name`, `units_sold`, `gmv`

### B. 기상청 ASOS (`data/processed/asos_weather_cache.csv`)

**관측소 5곳**: 서울(108), 수원(119), 부산(159), 대전(133), 광주(156)

| 컬럼       | 설명                         |
| ---------- | ---------------------------- |
| date       | 관측일                       |
| station_id | 관측소 ID                    |
| temp_mean  | 평균기온 (℃)                 |
| temp_min   | 최저기온 (℃)                 |
| temp_max   | 최고기온 (℃)                 |
| rain_mm    | 일강수량 (mm)                |
| snow_cm    | 일적설량 (cm)                |
| wind_mean  | 평균 풍속 (m/s)              |
| source     | "asos" or "ecmwf_open_meteo" |

### C. Open-Meteo ECMWF API

- **엔드포인트**: `https://api.open-meteo.com/v1/ecmwf`
- **라이브러리**: `openmeteo-requests`, `requests-cache`, `retry-requests`
- **일별 변수**: `temperature_2m_max`, `temperature_2m_min`, `precipitation_sum`, `windspeed_10m_max`, `snowfall_sum`
- **예측 범위**: 0~15일 (단기), 16~46일 (장기, ECMWF S2S 별도 옵션)
- **파일**: `services/api/data_pipeline/open_meteo_ecmwf.py`

### D. 바이박스 CSV (`data/raw/coupang/bi_box/`)

| 컬럼         | 설명              |
| ------------ | ----------------- |
| date         | 조회일            |
| sku          | SKU ID            |
| name         | 제품명            |
| price        | 판매가            |
| is_stockout  | 품절 플래그 (0/1) |
| bi_box_share | 바이박스 점유율   |

**기간**: 약 5개월 (커버리지 제한)

### E. 납품률 xlsx (`data/raw/logistics/납품률(20250413-20260418).xlsx`)

**18개 컬럼 (영문 라벨 기준)**

- Week of Delivery, Vendor ID
- Product Category, Sub Category
- Units Requested, Units Confirmed, Units Received
- Total Noncompliance Units + 8개 불량 유형 (Bar Code Error, Damaged Product 등)

**현재 사용**: `Week of Delivery`, `Units Requested`, `Product Category`

### F. 지역별 판매트렌드 (`data/raw/coupang/regional_trend/*.csv`)

- 지역별 판매 비중 (수도권·영남·호남·충청·강원·제주)
- 용도: 합성 2024 데이터에서 전국 평균 날씨를 지역 가중 평균으로 변환 (수도권 61.5%)

### G. 합성 2024 (`data/processed/synthetic_2024_*.csv`)

- `synthetic_2024_weekly.csv`: 34 SKU × 66주 = 2,244행, 학습 전용
- `synthetic_2024_delivery.csv`: 66주 카테고리 발주량
- 생성 로직: `services/api/data_pipeline/synthetic_data_generator.py`
- 산출 근거: `docs/logs/synthetic-data-explanation.md` 참조

---

## 4. 외부 API / 공공데이터 계정 정보

| 소스               | 인증                               | 환경변수                                             | 비고                  |
| ------------------ | ---------------------------------- | ---------------------------------------------------- | --------------------- |
| 기상청 ASOS        | API Key                            | `.env`의 `KMA_API_KEY`                               | 공공데이터포털        |
| Open-Meteo ECMWF   | 불필요                             | -                                                    | 무료, rate limit 관대 |
| ECMWF S2S Extended | 불필요 (ecmwf-opendata 라이브러리) | -                                                    | GRIB2 직접 다운로드   |
| OpenAI             | API Key                            | `.env`의 `OPENAI_API_KEY`                            | GPT-4o-mini           |
| Supabase           | Service Role Key                   | `.env`의 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | 내부 DB               |

---

## 5. 참고 문서

- 데이터 컨텍스트 (한계·이상치): `docs/logs/20260417-jungmin-data-context.md`
- 합성 데이터 생성 로직: `docs/logs/synthetic-data-explanation.md`
- 겨울 검증 심층 분석: `docs/logs/20260417-jungmin-winter-analysis.md`
- 발표용 요약: `docs/logs/20260417-jungmin-presentation-summary.md`
- PM 전달 코드 설명: `docs/logs/20260417-jungmin-code-for-pm.md`
- 리서치 근거: `hotpack_demand_research_verified.md`
