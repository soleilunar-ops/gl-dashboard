# PM Supabase 연동 v2 의사결정 회신 (2026-04-18 정민)

## 대상 문서

- `20260417-for-jungmin-human-v2.md` (PM 작성, Supabase 연동 가이드 v2)
- `20260417-for-jungmin-ai-v2.md` (AI 에이전트용 지시서 v2)

## 결론 요약

| #   | 질문                                         | 결정                                | PM 권고와 일치 |
| --- | -------------------------------------------- | ----------------------------------- | -------------- |
| ①   | 날씨 데이터 하이브리드(ASOS+ERA5) 방식 동의? | **동의**                            | ✅             |
| ②   | 바이박스 업로드 주기?                        | **C 주단위 배치**                   | -              |
| ③   | `model_version` 컬럼 유지?                   | **유지**                            | ✅             |
| ④   | 합성 2024 Supabase 업로드?                   | **로컬 유지**                       | ✅             |
| ⑤   | 지역 가중 방식?                              | **B seoul_dominant (수도권 61.5%)** | ✅             |

---

## ① 날씨 하이브리드 — 동의

**근거 (실측 확인 결과)**:

현재 로컬 `asos_weather_cache.csv` 겨울 구간(2025-11-01 ~ 2026-03-31) 755행 NULL 비율:

- `rain_mm`: **71.4% NULL**
- `snow_cm`: **92.1% NULL**
- `temp_*` / `wind_mean`: 0% NULL

Supabase `weather_unified`의 ASOS/ERA5 같은 기간 비교:

- ASOS `rain`: **100% NULL**, `precipitation`: 71.4% NULL
- ERA5 `rain` / `precipitation` / `snowfall`: **0% NULL (완전 커버)**
- ERA5 `wind_avg`: **100% NULL** → 바람은 반드시 ASOS 필요

**결정적 교차 검증**:

- ASOS `rain` NULL 755행을 ERA5 rain으로 매핑 시
  - ERA5 rain = 0 (비 안 옴): 577행 (76.4%)
  - **ERA5 rain > 0 (실제 강수): 178행 (23.6%)**
  - 실제 강수 있는 날 평균 3.63mm, 최대 37.40mm

→ **`fillna(0)`으로 단순 대체 시 23.6%의 실제 강수 정보를 놓침**. 하이브리드 필수.

**실무 영향**: `services/api/analytics/weekly_demand_forecast.py`의 weather 로드 로직을 Supabase 기반 하이브리드(ASOS temp+wind + ERA5 rain+snow)로 리팩토링 필요.

## ② 바이박스 업로드 주기 — C: 주단위 배치

**근거**: 일일 업로드는 단기·지엽적 변동(일일 가격 흔들림, 단기 품절)만 포착되어 **중장기 트렌드 분석에 제약**이 있을 수 있음. 주 단위 집계가 바이박스 점유율·가격 변동의 **넓은 관점 분석에 적합**하다는 판단.

**실무 영향**: 스크래핑 자동화 스케줄링 시 주 1회 배치 (월요일 새벽 등). 과거 5개월치는 1회성 백필 업로드.

## ③ `model_version` 컬럼 유지

**근거**:

- Model A는 이미 `round1 ~ round4` 여러 버전 실험을 거쳤고(`forecast_round4.csv` 증거) 앞으로도 피처 추가·카테고리별 분리 실험이 예정됨
- 버전 구분 없이 UPSERT 시 **이전 실험 결과를 덮어쓰기**하게 되어 A/B 비교·롤백이 불가
- 저장 공간 부담 미미 (row당 수 byte 추가)

## ④ 합성 2024 Supabase 업로드 — 로컬 유지

**근거**:

- 용도가 **학습 전용**. 대시보드 엔드포인트가 이 CSV를 참조하지 않음 (`docs/logs/20260417-jungmin-feature-data-map.md` 기준)
- 2,244행 규모로 Git 관리 충분 (필요 시 Git LFS)
- Supabase에 올려도 조회 주체가 없어 공간 낭비

## ⑤ 지역 가중 — B: seoul_dominant (수도권 61.5%)

**근거**:

- `services/api/data_pipeline/synthetic_data_generator.py`가 이미 **수도권 61.5% 가중**으로 2024 합성 데이터를 생성 중
- 합성 데이터와 실데이터 학습의 **일관성 유지에 필수** (가중치가 다르면 합성 증강 효과가 왜곡됨)
- PM 옵션 C(`regional_sales` 테이블 동적 가중)는 해당 테이블이 2026-01 이후만 있어 역사 구간 적용 불가

---

## 추가 요청 사항

- **`v_weather_hybrid` 뷰 제작 필요 여부**: Python에서 ASOS+ERA5 두 쿼리 후 pandas merge 하는 PM 패턴도 작동하나, 뷰가 있으면 코드가 간결해지고 인덱스 힌트가 DB에 남아 성능 유리. **가능하면 뷰 제작 선호** (PM 검토 요청).

## 실무 진행 순서 (PM 회신 수신 후)

1. PM이 4개 신규 테이블 DDL 적용 (`bi_box_daily`, `forecast_model_a`, `forecast_model_b`, `winter_validation`)
2. 정민: `weekly_feature_builder.py` / `weekly_demand_forecast.py`의 weather 로드를 하이브리드 쿼리로 전환
3. 정민: 바이박스 CSV → `bi_box_daily` 백필 업로드 스크립트 작성
4. 정민: Model A/B 배치 종료 시 UPSERT 로직 추가 (`forecast_model_a`, `forecast_model_b`)
5. 정민: 겨울 검증 결과 `winter_validation`으로 저장
6. 정민: FastAPI 엔드포인트 4종(`/weekly-prediction`, `/winter-analysis`, `/order-simulation`, `/insight`)을 Supabase 쿼리 기반으로 전환
7. E2E 테스트 (대시보드 브라우저 확인)

## 참고 데이터 확인 기록 (2026-04-17)

- `asos_weather_cache.csv` 겨울 NULL 실측 완료
- Supabase `weather_unified` ASOS/ERA5 755행 교차 검증 완료
- ERA5 rain 값 > 0인 178행 (ASOS NULL 기준) 확인으로 하이브리드 필요성 실증
