# PM 전달: 정민 코드 설명

> 작성자: 정민 | 2026-04-16
> PM 리뷰 요청용 코드 아키텍처 + 데이터 출처 + 한계 명세

---

## 1. 코드 구조 한눈에

```
services/api/
├── data_sources/
│   └── asos_api.py                     # 기상청 ASOS API 호출
│
├── data_pipeline/
│   ├── open_meteo_ecmwf.py             # Open-Meteo 미래 예보
│   ├── bi_box_loader.py                # 바이박스 CSV 파서
│   ├── delivery_rate_loader.py         # 납품률 xlsx 파서
│   ├── local_feature_builder.py        # 주단위 피처 빌더
│   ├── weekly_feature_builder.py       # Supabase 버전 (대기 중)
│   └── synthetic_data_generator.py     # 2024년 합성 데이터
│
├── analytics/
│   ├── weekly_demand_forecast.py       # (원작자 복원) LightGBM 학습 코어
│   ├── forecast_runner.py              # 전체 예측 파이프라인 실행
│   ├── order_response_model.py         # Model B (발주 반응)
│   ├── insight_generator.py            # OpenAI 인사이트
│   ├── winter_validation.py            # 겨울 검증 (A vs B)
│   ├── winter_analysis.py              # 오차 심층 분석
│   ├── model_b_tuning.py               # Model B 튜닝
│   └── per_sku_model.py                # SKU 개별 모델 비교
│
├── routers/
│   └── forecast.py                     # FastAPI 엔드포인트 6개
│
├── schemas/                            # PM 스켈레톤 (미수정)
├── main.py                             # FastAPI 엔트리 (PM 영역)
├── run_pipeline.py                     # 통합 CLI
└── requirements.txt
```

---

## 2. 데이터 소스 (모든 출처 명시)

| 데이터                | 유형     | 출처                                   | 기간/행수                       | 용도                        |
| --------------------- | -------- | -------------------------------------- | ------------------------------- | --------------------------- |
| 쿠팡 일간종합성과지표 | 실       | Supabase `daily_performance` (PM 로드) | 12,492행, 2025-04~2026-04       | Model A 학습·검증           |
| 기상청 ASOS           | 실       | 공공데이터포털 API 직접 호출           | 4,170행, 2024-01~2026-04, 5지점 | 날씨 피처 + 합성 생성       |
| Open-Meteo ECMWF      | 실       | Open-Meteo API                         | 80행, +16일 예보                | 미래 날씨                   |
| 바이박스분석          | 실       | 쿠팡 WING CSV 5개월                    | 4,624행, 2025-12~2026-04        | 품절 마스킹 + 가격          |
| 납품률                | 실       | 쿠팡 WING xlsx                         | 121행, 49주                     | Model B 학습                |
| 지역별판매트렌드      | 실       | 쿠팡 WING CSV                          | 5,353행                         | 지역 가중치 (수도권 61.5%)  |
| **2024 합성 판매**    | **합성** | ASOS 실날씨 + 실데이터 계수            | 2,244행, 2024-01~2025-03        | **학습 보강** (검증 미사용) |

**더미 데이터 사용 없음.** 합성 데이터는 `synthetic=True` 플래그로 명시, 검증에서 자동 제외.

---

## 3. 전체 파이프라인 흐름

```
[매일 실행 가능]

1. ASOS/Open-Meteo → 날씨 수집 (asos_api.py, open_meteo_ecmwf.py)
           ↓
2. Supabase daily_performance 조회 + 바이박스 CSV 로드
           ↓
3. local_feature_builder 로 주단위 집계
   (34 SKU × 54주 = 853행, 16 피처)
           ↓
4. Model A (LightGBM) 학습 + 예측
   forecast_runner.run_forecast_pipeline()
           ↓
5. Model B 비율 모델 + SKU 분배
   order_response_model.run_model_b_pipeline()
           ↓
6. OpenAI 인사이트 생성
   insight_generator.generate_forecast_insight()
           ↓
7. 결과 → Supabase forecasts (대기) + 프론트 차트
```

**CLI 통합 실행**: `python services/api/run_pipeline.py`

---

## 4. 주요 코드 결정의 근거

### 4-1. 모든 계수에 근거 명시

| 계수                   | 값                         | 근거                                               |
| ---------------------- | -------------------------- | -------------------------------------------------- |
| 체감온도 공식          | JAG/TI 2001                | 기상청 공식 채택 (weatheri.co.kr)                  |
| 적용 조건              | T≤10℃, V≥1.3m/s            | 기상청 공식                                        |
| 한파 임계              | -12℃                       | 기상청 한파주의보                                  |
| 급강하 임계            | -5℃                        | Lee & Zheng 2024 (JAERE)                           |
| 기온 구간 5℃ 단위      | 한파-12, 0, 5, 10, 15, 20℃ | KMITI 업계 관행 + 기상청 기준                      |
| 월별 계절 계수         | 12월=1, 11월=0.42...       | 실데이터 월 판매합/12월 판매합                     |
| 기온 구간별 민감도     | -5~5℃ 구간 13,114개/℃ 등   | 실데이터 54주 측정                                 |
| 적설 효과              | 2.29배                     | 겨울 내 실측 (계절 교란 제거)                      |
| 월별 노이즈 CV         | 4.5~185%                   | 실측 std/mean                                      |
| 지역 가중치            | 수도권 61.5%               | 지역별판매트렌드 실데이터                          |
| SKU 분배 비율          | 34개별                     | 실데이터 판매 비중                                 |
| 납품 월별 비율         | 0.16~62.95배               | 납품률 × 일간성과 매칭                             |
| 8월 납품 시작          | ISO week 35                | 사용자 도메인 지식                                 |
| 첫 한파 날짜           | 2024-11-27                 | 기상청 발표 + Perplexity 확인                      |
| **체감온도 보정 상한** | **±50%**                   | **⚠️ 유일한 비데이터 설정 — 과보정 방지 안전장치** |

**총 17개 중 16개가 공식·논문·실데이터·사용자 근거. 임의값 1개만.**

---

## 5. Model A (LightGBM) 상세

### 학습 데이터

- 전체: 853행 (34 SKU × 54주)
- 학습: 최근 8주 제외한 46주
- 검증: 최근 8주 (비시즌)

### 피처 16개

- lag_1, lag_2, lag_4: 판매 과거값 (시계열 표준)
- temp_mean/min/max, rain_mm, snow_cm, wind_mean: 날씨 기본
- cold_days_7d: 한파 일수 (기상청 기준)
- temp_range: 일교차
- promotion_flag: 프로모션 여부
- weekly_min_price: 바이박스 최저가
- weekly_bi_box_share_mean: 점유율
- weekly_stockout_flag: 품절
- first_snow_flag: 시즌 첫 눈 주 (신규, 겨울 전환점 대응)

### 하이퍼파라미터

- learning_rate=0.05, num_leaves=31 (LightGBM 기본값)
- num_boost_round=500, early_stopping=50

### 현재 성능

| 검증 기간                   | val MAE               |
| --------------------------- | --------------------- |
| 봄만 (R4)                   | 636                   |
| 가을~겨울~봄 (합성 포함, B) | 1,668                 |
| **겨울(11~1월)만**          | **2,143** ← 처음 측정 |

---

## 6. Model B (비율 모델 + 분배)

### 구조

```
카테고리 총 판매 × 최근 N주 발주/판매 비율 = 예상 발주
         ↓
예상 발주 × SKU 비중 = SKU별 발주
```

### 튜닝 결과 (실측)

- `ratio_lookback_weeks`: 4주 최적 (MAE 5,477)
- `sku_distribute_weeks`: 2주 최적 (MAE 180)

### SKU 분배 개선

- 비시즌 활성 SKU 문제: 최근 4주에 판매 없는 SKU 21개
- 해결: 점진 확장 로직 (4주→12주→전체 기간)
- **결과: 활성 SKU 13/34 → 25/34**

---

## 7. 합성 데이터 생성 (synthetic_data_generator.py)

### 왜 필요했나

쿠팡 일간성과 1년치만으로는 **겨울 예측 정확도 측정 불가**.
2024년 실날씨(ASOS) + 실데이터 계수로 합성해서 겨울 데이터 확보.

### 원칙

1. **합성은 학습에만** — 검증은 반드시 실데이터
2. **모든 계수는 실데이터/공식 근거** — 임의값 최소화
3. **`synthetic=True` 플래그** — 결과 데이터에 명시

### 계산 흐름

```
base = 12월 실측 주평균(130,342) × 월별 계절 계수(실측 비율)
     × 체감온도 편차 보정 (구간별 실측 민감도)
     × 적설 효과 (겨울 내 실측 2.29배)
     × 급강하 효과 (실측 1.88배, 적응 감쇠)
     + 노이즈 (월별 실측 CV)
     × SKU 분배 비율 (실측)
```

### 한계 (정직한 평가)

| 항목            | 내용                                              |
| --------------- | ------------------------------------------------- |
| 겨울 1.6배 과대 | 1년치 실데이터로 기온·눈·계절 교란 완전 분리 불가 |
| 미반영 이벤트   | 2024년 프로모션, 경쟁사, 쿠팡 정책 변화           |
| SKU 비율 고정   | 시즌 초/말 인기 변화 미반영                       |
| 합성은 학습용만 | 검증에 쓰면 의미 없음                             |

---

## 8. 겨울 검증 방법론 (winter_validation.py)

### 데이터 분할

```
학습 (~2,450행):
  - 합성 2,108행 (2024-01 ~ 2025-03)  ← synthetic=True
  - 실 342행 (2025-04 ~ 2025-09, 봄+여름)

검증 (~511행):
  - 실 2025-10 ~ 2026-04 (가을+★겨울★+시즌종료)
  - 합성 0행 (엄격 분리)
```

### 원칙

- 합성 → 검증에 절대 포함 안 됨 (`is_synthetic=1` 필터)
- 검증에 실제 겨울(11~1월) 포함 → 처음으로 겨울 MAE 측정

### 결과

- **전체 val MAE: 1,668**
- **겨울(11~1월) MAE: 2,143**
- 27주 검증 중 과대 14주 / 과소 13주 (편향 균형)

### 발견

- 10~12월: -25~-48% **과소 예측** (시즌 전환점)
- 1~4월: +7~+162% **과대 예측** (비시즌)
- LightGBM의 "평균화" 경향 (극단값 회피)

---

## 9. FastAPI 엔드포인트

| 메서드 | 경로                         | 역할                    |
| ------ | ---------------------------- | ----------------------- |
| GET    | `/health`                    | 헬스체크                |
| GET    | `/forecast/latest`           | 최근 예측 N건 조회      |
| GET    | `/forecast/weekly`           | 향후 N주 예측           |
| GET    | `/forecast/insight`          | OpenAI 인사이트         |
| GET    | `/forecast/order-simulation` | Model B 발주 시뮬레이션 |
| POST   | `/forecast/run`              | 전체 파이프라인 실행    |

---

## 10. 프론트엔드

- `src/app/(dashboard)/analytics/forecast/page.tsx` (배치만, 10줄)
- `src/components/analytics/forecast/ForecastDashboard.tsx` (본체)
- 구성: AI 인사이트 카드 + KPI 3장 + 판매 차트 + 예측 차트 + 발주 시뮬레이션 테이블

---

## 11. 한계와 향후 과제

| 한계                  | 원인                   | 대안                                   |
| --------------------- | ---------------------- | -------------------------------------- |
| 1년치 실데이터        | 쿠팡 일간성과 2025-04~ | 2026 겨울 축적 시 자동 해결            |
| 겨울 전환점 과소 예측 | LightGBM 평균화 경향   | first_snow_flag 추가 (완료), 분위 회귀 |
| 소량 SKU 예측 무의미  | 주 판매 1~4개          | 평균 분배로 대체                       |
| 합성 겨울 1.6배 과대  | 54주 교란 분리 한계    | 2년치 확보 후 다변량 회귀              |
| Supabase 연동 대기    | PM DB 재구축 중        | 스키마 확정 후 1시간 내 연동           |

---

## 12. PM 확인 필요 항목

| #   | 항목                                   | 긴급도     |
| --- | -------------------------------------- | ---------- |
| 1   | Supabase 최종 스키마 (테이블명+컬럼명) | 🔴         |
| 2   | `weather_data` 4,251행 재투입 허가     | 🔴         |
| 3   | `forecasts` Model A 결과 insert 허가   | 🔴         |
| 4   | 납품률 전용 테이블 신설 여부           | 🟡         |
| 5   | ERP 코드 매핑 (GSBC vs GL)             | 🟡         |
| 6   | PR (team/정민 → submain) 재리뷰        | 위 해결 후 |

---

## 13. 재현 방법

```bash
# 1. 전체 파이프라인
python services/api/run_pipeline.py

# 2. 겨울 검증
python services/api/analytics/winter_validation.py

# 3. 심층 분석
python services/api/analytics/winter_analysis.py

# 4. Model B 튜닝
python services/api/analytics/model_b_tuning.py

# 5. 합성 데이터 재생성
python services/api/data_pipeline/synthetic_data_generator.py

# 6. 서버 실행
uvicorn services.api.main:app --port 8000  # FastAPI
npm run dev                                 # Next.js
```

---

## 14. 참고 문헌

| 출처                                    | 사용                                  |
| --------------------------------------- | ------------------------------------- |
| 기상청 (weatheri.co.kr, kma_131 블로그) | 체감온도 JAG/TI 공식, 한파 -12℃       |
| Lee, S. & Zheng, S. (2024). _JAERE_     | 기온 급강하 -5℃, 적응 효과 hump shape |
| KMITI 날씨경영 (kmiti.or.kr)            | 5℃ 구간, 10℃ 발주 트리거              |
| 기상청 발표 (2024-11-27)                | 첫 한파 날짜                          |

---

## 15. 마무리

- **코드 품질**: 실데이터·공식 기반, 임의값 최소화 (17/16)
- **투명성**: 모든 수치에 근거 태그
- **정직성**: 합성 데이터 플래그 + 한계 명시
- **재현성**: CLI 스크립트 6개로 전부 재생성 가능

PM 스키마 확정되면 Supabase 연동 1시간 내 완료 가능한 상태입니다.
