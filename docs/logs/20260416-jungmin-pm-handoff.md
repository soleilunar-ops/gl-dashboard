# PM 스키마 확정 후 정민 작업 체크리스트

> PM이 DB 재구축 완료 후, 최종 테이블명·컬럼명 공유해주시면 아래 순서로 진행합니다.

## PM에게 필요한 정보

1. **테이블명 최종 목록** (이전 → 변경)
   - daily_performance (확인됨)
   - products → ?
   - sku_mappings → ?
   - weather_data → ? (우리가 다시 만들어도 되는지)
   - forecasts → ? (우리가 다시 만들어도 되는지)
   - coupang_logistics → ?

2. **컬럼명 매핑** (최소 daily_performance 기준)
   - 현재 확인: sale_date, sku_id, promo_units_sold, vendor_item_id, vendor_item_name 등
   - category_l3 컬럼 유무 (핫팩 필터에 사용)

3. **납품률 데이터용 테이블** 신설 가능 여부
   - 현재 로컬 xlsx만 있음 (49주 × 4카테고리)
   - Supabase 테이블화하면 파이프라인 자동화 가능

4. **ERP 코드 체계** (GSBC... vs GL...) 매핑 규칙

---

## PM 응답 후 정민 작업 순서

### 1단계 — 즉시 (1시간)

- [ ] `useForecast.ts` 테이블·컬럼명 수정
- [ ] `routers/forecast.py` 테이블명 수정
- [ ] `weekly_feature_builder.py` Supabase 쿼리 컬럼 수정
- [ ] `forecast_runner.py` product_id 매핑 쿼리 수정

### 2단계 — weather_data 재투입 (30분)

- [ ] ASOS 캐시(data/processed/asos_weather_cache.csv, 4,170행) → weather_data insert
- [ ] Open-Meteo 미래 16일 재수집 → weather_data upsert

### 3단계 — forecasts 재생성 (30분)

- [ ] Model A Round 4 재실행 (마스킹+bi_box+wind_mean)
- [ ] 오늘 이후 예측만 forecasts insert (신뢰구간 포함)

### 4단계 — 프론트 검증 (30분)

- [ ] `npm run dev` → 브라우저 로그인 → /analytics/forecast
- [ ] 판매 차트: daily_performance 실데이터 렌더 확인
- [ ] 예측 차트: forecasts 실데이터 렌더 확인
- [ ] KPI 카드: 숫자 정확성 확인

### 5단계 — 통합 테스트 (1시간)

- [ ] `uvicorn services.api.main:app` 실행
- [ ] Swagger(/docs) → /forecast/run POST 호출 → 학습+insert 성공
- [ ] 프론트 새로고침 → 예측 차트 자동 갱신 확인

### 6단계 — PR (30분)

- [ ] `git push -u origin team/정민`
- [ ] `gh pr create --base submain`
- [ ] PM 리뷰 요청

---

## 현재 로컬 산출물 (data/processed/, gitignored)

| 파일                          | 내용                                    |
| ----------------------------- | --------------------------------------- |
| asos_weather_cache.csv        | ASOS 2024-01~2026-04 5지점 (4,170행)    |
| weekly_feature_table.csv      | 주단위 피처 (853행, 34 SKU × 54주)      |
| forecast_round4.csv           | Model A Round 4 예측 (132행, 미래 35행) |
| model_b_category_forecast.csv | Model B 카테고리 발주 예측 (29행)       |
| model_b_sku_distribution.csv  | Model B SKU 분배 (377행)                |
| model_b_training_data.csv     | Model B 학습 데이터 (48행)              |
