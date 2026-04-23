# 정민이 직접 확인하는 방법

> 각 단계마다 명령 → 예상 출력 → 의미 순서로.
> 복잡한 건 없습니다. 터미널에 복붙만 하면 됩니다.

---

## 0. 준비 (처음 한 번만)

```bash
cd c:\gl-dashboard
```

터미널이 `c:\gl-dashboard` 위치에 있는지 확인.

---

## 1. 데이터 파일 있는지 확인

```bash
ls data/processed/weekly_feature_table.csv
ls data/processed/synthetic_2024_weekly.csv
ls data/processed/forecast_round4.csv
ls data/raw/coupang/bi_box/
```

**보여야 할 것**:

- 네 경로 모두 파일이 있다고 나오면 OK
- 없으면 → 아래 "2. 전체 재생성"으로

---

## 2. 전체 파이프라인 한 줄 실행 (가장 간단)

```bash
python services/api/run_pipeline.py
```

**예상 출력** (약 30초 걸림):

```
[1/4] weekly_df 빌드
  → 853행, 34 SKU, 마스킹 389행 제거
[2/4] Model A 학습 + 예측
  → val_mae=636, 예측 132행
[3/4] Model B 발주 반응 추정
  → 학습 48주, SKU 분배 25 SKU 활성
[4/4] AI 인사이트 생성

────────────────────────
[한국어 인사이트 문장 3~5줄]
────────────────────────

파이프라인 완료
  Model A: val_mae=636
  Model B: 25 SKU 발주 분배
```

**확인 포인트**:

- [ ] 에러 없이 끝까지 실행됨
- [ ] val_mae 숫자가 나옴
- [ ] AI 인사이트 한국어 문장이 출력됨
- [ ] "Model B: 25 SKU" — 13이 아니라 25면 개선 적용된 것

---

## 3. 겨울 예측 정확도 확인 (핵심 성과)

```bash
python services/api/analytics/winter_validation.py
```

**예상 출력** (약 1분):

```
[A] 합성 없음: val MAE 634, 검증 기간 봄(비시즌)
[B] 합성 포함: val MAE 1,668, 겨울(11~1월) MAE 2,143

최종 비교
A_no_synthetic:
  val_mae: 634
  val_period: 2026-02-16 ~ 2026-04-06
  val_season: 봄(비시즌)

B_with_synthetic:
  val_mae: 1,668
  winter_mae: 2,143
  val_period: 2025-10-06 ~ 2026-04-06
  val_season: 가을+겨울+시즌종료
```

**의미**:

- A는 봄만 시험본 결과
- **B는 겨울 포함 시험** ← 이게 합성 데이터의 가치
- 겨울 MAE 2,143 = 이 프로젝트에서 처음 측정된 숫자

---

## 4. 오차 심층 분석

```bash
python services/api/analytics/winter_analysis.py
```

**예상 출력 중요 부분**:

```
[월별]
  10월: -48.4% 과소
  11월: -25.1% 과소
  12월: -33.7% 과소  ← 겨울 피크 과소 예측
   2월: +162.2% 과대
   3월: +58.5% 과대

[오차 큰 SKU Top 5]
  SKU 63575566: MAE 15,597 (주평균 26,050개, 오차율 59.9%)
  SKU 63216406: MAE 5,787 (주평균 15,898개, 오차율 36.4%)
```

**의미**: 모델이 시즌 전환점에서 과소 예측, 비시즌에서 과대 예측하는 경향.

---

## 5. Model B 튜닝 결과 확인

```bash
python services/api/analytics/model_b_tuning.py
```

**예상 출력**:

```
ratio_lookback_weeks 튜닝
  4주: 평균 MAE 5477.2  ← 최적
  8주: 25729.9
  12주: 36442.0

최적 lookback: 4주 (MAE 5477.2)

sku_distribute_weeks 튜닝
  2주: MAE 180.0  ← 최적
  4주: 592.2

최적 distribute: 2주 (MAE 180.0)
```

**의미**: 발주/판매 비율은 최근 4주, SKU 분배는 최근 2주가 가장 정확.

---

## 6. 브라우저에서 대시보드 확인

### 6-1. FastAPI 서버 시작 (터미널 1)

```bash
uvicorn services.api.main:app --port 8000
```

→ `Application startup complete` 메시지 나오면 OK

### 6-2. Next.js 서버 시작 (터미널 2, 다른 창)

```bash
npm run dev
```

→ `Ready in Xs` 나오면 OK

### 6-3. 브라우저 접속

1. **FastAPI 문서**: http://localhost:8000/docs
   - 엔드포인트 6개 보이면 OK
   - `/forecast/insight` 눌러서 "Try it out" → Execute
   - 한국어 인사이트가 응답으로 나오면 성공

2. **대시보드**: http://localhost:3000/auth/login
   - 아이디: `admin` / 비밀번호: `1234`
   - 로그인 후 주소창에 `http://localhost:3000/analytics/forecast`
   - **확인할 요소 4개**:
     - [ ] AI 발주 인사이트 카드 (파란색, 한국어 3~5줄)
     - [ ] KPI 3장 (판매 수량, GMV, 예측 수량)
     - [ ] 판매 추이 차트 (파란색 라인)
     - [ ] 발주 시뮬레이션 테이블 (SKU 이름 + 수량 + 비중)

---

## 7. 합성 데이터 다시 만들기

```bash
python services/api/data_pipeline/synthetic_data_generator.py
```

**예상 출력**:

```
[1/4] 실데이터 계수 추출
  월별 계수: {1: 0.55, 2: 0.13, ..., 12: 1.0}
  적설 배수: 2.29배
  급강하 실측: 2건
  12월 주 평균: 130,342

[2/4] 2024년 날씨 (체감온도 포함): 53주
[3/4] 합성 판매 생성: 2244행 (34 SKU × 53주)
[4/4] 합성 납품 생성: 53행
```

**생성 파일**: `data/processed/synthetic_2024_weekly.csv`, `synthetic_2024_delivery.csv`

---

## 8. 중요 수치 확인 요약

터미널에 한 번에 확인:

```bash
python -W ignore -c "
import json
from pathlib import Path

# 겨울 검증
w = json.loads(Path('data/processed/winter_validation_result.json').read_text(encoding='utf-8'))
print('■ 겨울 검증')
print(f'  합성 없음 val MAE: {w[\"A_no_synthetic\"][\"val_mae\"]}')
print(f'  합성 있음 val MAE: {w[\"B_with_synthetic\"][\"val_mae\"]}')
print(f'  겨울 MAE:         {w[\"B_with_synthetic\"][\"winter_mae\"]}')

# Model B 튜닝
t = json.loads(Path('data/processed/model_b_tuning.json').read_text(encoding='utf-8'))
print()
print('■ Model B 튜닝')
for k, v in sorted(t['lookback'].items(), key=lambda x: int(x[0])):
    print(f'  lookback {k}주: MAE {v[\"avg_mae\"]}')

# 개별 모델
p = json.loads(Path('data/processed/per_sku_model_comparison.json').read_text(encoding='utf-8'))
print()
print('■ 개별 모델')
print(f'  {p[\"conclusion\"]}')

# 심층 분석
s = json.loads(Path('data/processed/winter_analysis_summary.json').read_text(encoding='utf-8'))
print()
print('■ 심층 분석')
print(f'  전체 MAE: {s[\"overall_mae\"]}')
print(f'  겨울 MAE: {s[\"winter_mae\"]}')
print(f'  과대 예측: {s[\"bias\"][\"over_predict_weeks\"]}주')
print(f'  과소 예측: {s[\"bias\"][\"under_predict_weeks\"]}주')
"
```

**예상 출력**:

```
■ 겨울 검증
  합성 없음 val MAE: 634.9
  합성 있음 val MAE: 1668.4
  겨울 MAE:         2142.9

■ Model B 튜닝
  lookback 4주: MAE 5477.2
  lookback 6주: MAE 14140.5
  lookback 8주: MAE 25729.9

■ 개별 모델
  개별 모델이 오히려 나쁨 (평균 -15.5%, 과적합 추정)

■ 심층 분석
  전체 MAE: 1697.1
  겨울 MAE: 2143.0
  과대 예측: 14주
  과소 예측: 13주
```

---

## 9. 문제 생기면?

### 오류 "No module named ..."

```bash
pip install -r services/api/requirements.txt
```

### OpenAI 호출 실패 / 인사이트 안 나옴

- `.env` 파일에 `OPENAI_API_KEY` 있는지 확인
- 없거나 만료면 → fallback(룰 기반) 문장이 대신 나옴 (정상)

### Supabase 연결 에러

- 현재 PM이 DB 재구축 중이라 일부 테이블 접근 불가
- CLI(`run_pipeline.py`)는 로컬 CSV로 돌아가서 영향 없음
- 브라우저 대시보드는 Supabase 필요 → PM 스키마 확정 후 작동

### 합성 데이터 안 만들어지면

- `data/raw/coupang/bi_box/` 폴더에 CSV 5개 있는지
- `data/processed/asos_weather_cache.csv` 있는지
- 없으면 → 데이터 파일 복원 필요 (PM/사용자 확인)

---

## 10. 한 줄 요약

```bash
# "전체 제대로 되나?" 확인용 한 줄
python services/api/run_pipeline.py && python services/api/analytics/winter_validation.py
```

두 줄 끝까지 에러 없이 돌아가면 **파이프라인 정상**.
