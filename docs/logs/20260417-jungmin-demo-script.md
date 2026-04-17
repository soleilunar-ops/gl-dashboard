# 시연 시나리오 스크립트

> 발표 시 따라가기 위한 체크리스트. 각 단계의 명령·예상 출력·멘트 포함.

---

## 사전 준비 (발표 5분 전)

```bash
# 1. 작업 디렉토리 진입
cd c:\gl-dashboard

# 2. .env 파일 확인 (SUPABASE_URL, OPENAI_API_KEY 등)
cat .env | grep -E "SUPABASE_URL|OPENAI" | cut -d= -f1

# 3. 필수 CSV 존재 확인
ls data/processed/weekly_feature_table.csv
ls data/processed/synthetic_2024_weekly.csv
ls data/processed/forecast_round4.csv

# 4. FastAPI 서버 시작 (터미널 A)
uvicorn services.api.main:app --port 8000

# 5. Next.js 서버 시작 (터미널 B)
npm run dev
# → http://localhost:3000 준비 완료 대기 (약 30초)

# 6. 브라우저 탭 2개 미리 열기
# - http://localhost:3000/auth/login
# - http://localhost:8000/docs
```

**체크**: 두 서버 모두 OK?

- `/health` → `{"status":"ok"}` 반환
- `/auth/login` 페이지 로드

---

## 시연 순서 (총 10분 내)

### Step 1. 데이터 흐름 설명 (1분)

**멘트**:

> "우리 프로젝트는 쿠팡 일간성과 1년치 + 기상청 날씨 2.3년치 + 바이박스·납품률 데이터를 결합해 핫팩 수요 예측 파이프라인을 만들었습니다."

**시각화**:
`20260416-jungmin-presentation-summary.md` → 2. 아키텍처 다이어그램 보여주기

---

### Step 2. 데이터 투명성 (1분)

**멘트**:

> "사용한 모든 데이터의 출처를 명시했고, 더미 데이터는 없습니다. 2024년 판매량만 합성해서 생성했는데, `synthetic=True` 플래그로 명시합니다."

**화면**:

```bash
python -W ignore -c "
import pandas as pd
real = pd.read_csv('data/processed/weekly_feature_table.csv')
synth = pd.read_csv('data/processed/synthetic_2024_weekly.csv')
print(f'실데이터: {len(real)}행 (2025-04~2026-04)')
print(f'합성:     {len(synth)}행 (2024-01~2025-03, synthetic=True)')
"
```

**예상 출력**:

```
실데이터: 853행 (2025-04~2026-04)
합성:     2244행 (2024-01~2025-03, synthetic=True)
```

---

### Step 3. 파이프라인 CLI 1회 실행 (2분)

**멘트**:

> "전체 파이프라인을 한 줄로 돌려보겠습니다. 날씨→예측→발주→인사이트까지 자동."

**명령**:

```bash
python services/api/run_pipeline.py
```

**예상 출력**:

```
[1/4] weekly_df 빌드
  → 853행, 34 SKU, 마스킹 389행 제거
[2/4] Model A 학습 + 예측
  → val_mae=636, 예측 132행
[3/4] Model B 발주 반응
  → 학습 48주, SKU 분배 25/34 활성
[4/4] AI 인사이트 생성
  → "SKU 63216406(하루온 붙이는 핫팩): 주문 준비 권장..."

파이프라인 완료
Model A: val_mae=636
Model B: 25 SKU 발주 분배
```

---

### Step 4. 브라우저 대시보드 (2분)

**멘트**:

> "프론트엔드에서 시각적으로 확인해보겠습니다. admin / 1234로 로그인하고 수요예측 페이지로."

**순서**:

1. `http://localhost:3000/auth/login` 열기
2. admin / 1234 로그인
3. `/analytics/forecast` 페이지 이동
4. **AI 인사이트 카드**: OpenAI 생성 한국어 권장문
5. **KPI 3장**: 최근 판매, GMV, 예측 수량
6. **판매 추이 차트**: 보온소품 SKU 1년치 시계열
7. **예측 차트**: forecasts 테이블 예측치
8. **발주 시뮬레이션 테이블**: Model B 결과 (SKU + 제품명 + 수량)

---

### Step 5. 겨울 검증 결과 (2분, 핵심)

**멘트**:

> "1년치 데이터만으로는 겨울 예측 정확도를 측정할 수 없었는데, 2024년 합성 데이터를 만들어 처음으로 겨울 MAE를 측정했습니다."

**명령**:

```bash
python services/api/analytics/winter_validation.py
```

**예상 출력** (중요 부분):

```
[A] 합성 없음:    val MAE 638 (봄 비시즌만)
[B] 합성 포함:    val MAE 1,668
                  겨울(11~1월) MAE 2,143 ← 처음 측정
```

**명령**:

```bash
python services/api/analytics/winter_analysis.py
```

**예상 출력** (중요):

```
[월별]
  10월: -48.4% 과소
  11월: -25.1% 과소
  12월: -33.7% 과소  ← 겨울 피크 과소 예측
   1월:  +7.4% 과대
   2월:  +162.2% 과대
   3월:  +58.5% 과대
```

**멘트**:

> "모델이 시즌 전환점에서 과소, 비시즌에서 과대 예측하는 경향을 발견했고, 이건 향후 데이터 축적으로 개선할 수 있는 방향성을 줍니다."

---

### Step 6. 모든 계수 근거 (1분)

**멘트**:

> "임의로 넣은 숫자가 있는지 점검했고, 17개 계수 중 16개는 공식·논문·실데이터 근거가 있습니다. 나머지 1개는 안전장치입니다."

**화면**: `20260416-jungmin-presentation-summary.md` → 5번 섹션 보여주기

---

### Step 7. Q&A 대비 (2분)

**예상 질문과 답변 준비**:

**Q1. "합성 데이터를 쓴다고 했는데, 학습에만 쓰고 검증엔 안 쓴 게 맞나요?"**
A: 네, `load_combined_training_data()`에서 `is_synthetic=1` 플래그로 분리. 검증 데이터는 `is_synthetic=0`인 실데이터만 사용.

**Q2. "MAE 2,143이 좋은 건가요?"**
A: 절대값보단 **SKU별 해석**이 중요. 상위 SKU(주 15,000개 판매)는 36% 오차 — 의사결정에 쓸 만한 수준. 소량 SKU는 MAE 자체가 의미 없음.

**Q3. "기온 구간별 민감도 13,114개/℃는 어디서 왔나요?"**
A: 실데이터 54주에서 체감온도 구간별 평균 판매 차이를 계산. 0~5℃ 구간에서 1℃ 떨어질 때 13,114개 증가. 임의값 아님.

**Q4. "Supabase 연동은 왜 안 됐나요?"**
A: PM이 DB 재구축 중이라 스키마 확정 대기. 로컬 모드로 전환해서 진행 중이며, 스키마 확정 후 1시간 내 연동 완료 가능.

**Q5. "다음 스텝은?"**
A: 2026년 겨울 실데이터가 쌓이면 재검증. 분위 회귀로 SKU별 신뢰구간 개선. Model B는 쿠팡 WING API 연동.

---

## 돌발 상황 대응

### 시연 중 에러 발생

**FastAPI /forecast/insight 502 에러**:

- 원인: OpenAI API 키 만료 또는 크레딧 소진
- 대응: "실 호출 실패 시 룰 기반 fallback이 동작합니다" → 코드의 `_fallback_insight()` 보여주기

**Next.js 로그인 실패**:

- 원인: Supabase Auth 토큰 만료
- 대응: 로그인 건너뛰고 CLI로 시연 마무리

**합성 데이터 파일 없음**:

```bash
python services/api/data_pipeline/synthetic_data_generator.py
```

---

## 시연 종료 멘트

> "이번 파이프라인은 매일 자동으로 돌릴 수 있는 재고 의사결정 지원 시스템입니다.
> 17개 계수 중 16개가 공식·실데이터 기반이라 투명성이 높고,
> 합성 데이터도 학습에만 사용해서 결과 검증이 공정합니다.
> 2026 겨울 시즌 실데이터가 쌓이면 재검증해서 정확도를 더 올릴 수 있습니다."

---

## 체크리스트

- [ ] FastAPI 서버 실행
- [ ] Next.js 서버 실행
- [ ] 브라우저 탭 2개 준비
- [ ] 요약 문서 열어두기 (`20260416-jungmin-presentation-summary.md`)
- [ ] 터미널 1개 클리어된 상태 준비
- [ ] `.env` 키 유효성 확인
- [ ] 시연용 CSV 3개 존재 확인
