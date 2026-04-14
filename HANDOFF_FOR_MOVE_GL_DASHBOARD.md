# 인수인계 문서 (이동용)

이 문서는 프로젝트 폴더를 `C:\gl-dashboard`로 이동한 뒤, 다른 Tool/에이전트가 즉시 작업을 이어가기 위한 기준 문서다.

---

## 1) 프로젝트 개요

### 프로젝트 목적
- SKU 단위 수요예측 모델을 만들기 위한 **데이터 수집 + 피처 테이블 생성 파이프라인**을 구축한다.
- 최종적으로 아래 입력 테이블을 안정적으로 생성하는 것이 1차 목표다.
  - `daily_feature_table`
  - `weekly_feature_table`
- 이후 `scripts/run_weekly_forecast.py`로 주간 예측(`weekly_sales_qty`) 학습/추론을 수행한다.

### 현재 구현 철학
- 모델 고도화 이전에, **외부 데이터 연동 신뢰성**(인증, 수집, 예외처리, 재현성) 확보에 집중.
- 더미데이터를 만들지 않고, 미확정 규칙은 TODO/NotImplemented로 명시.
- 키/토큰은 코드 하드코딩 금지, `.env`/`~/.ecmwfapirc`/환경변수 사용.

---

## 2) 데이터 소스/방식

### 과거/관측 데이터
- **기상청 ASOS API (JSON)**
  - 대상 관측소: 서울108, 수원119, 부산159, 대전133, 광주156
  - 수집 모듈: `data_sources/asos_api.py`

### 미래 예보 데이터
- **ECMWF Open Data (0~15일)**
  - 수집 모듈: `data_sources/ecmwf_loader.py`
  - 패키지: `ecmwf-opendata`
  - 산출물: GRIB2 파일

- **ECMWF 확장 (16~46일, S2S/API)**
  - 현재 상태: 인터페이스/placeholder 완료, 실구현 TODO
  - 모듈: `data_sources/ecmwf_extended.py`
  - 전제: `ecmwf-api-client` + 권한/라이선스 + `~/.ecmwfapirc`

- **Open-Meteo ECMWF HTTP 경로 (운영 편의용)**
  - 모듈: `data_pipeline/open_meteo_ecmwf.py`
  - 목적: GRIB 파싱 없이 일별 예보를 DataFrame으로 빠르게 사용

---

## 3) 현재 파일 구조 (핵심만)

```text
<project_root>/
  analytics/
    weekly_demand_forecast.py
    feature_engineering.py
    ...
  data_sources/
    asos_api.py
    ecmwf_loader.py
    ecmwf_extended.py
  data_pipeline/
    kma_api.py
    open_meteo_ecmwf.py
    weather_loader.py
    ecmwf_forecast_data.py
    sales_loader.py
    marketing_loader.py
  scripts/
    run_weekly_forecast.py
    ecmwf_open_pipeline.py
    kma_api_reference_samples.py
    open_meteo_ecmwf_http_example.py
  config/
    env.example
    feature_flags.example.yaml
  .env
  .gitignore
  requirements.txt
  HANDOFF_PROGRESS.md
  HANDOFF_FOR_MOVE_GL_DASHBOARD.md
```

---

## 4) 구현/검증 상태 (업데이트 반영)

### 완료
- ASOS 수집 모듈 작성 및 실호출 검증 완료
  - `fetch_asos_multi_station_daily('2026-04-01','2026-04-03')` 성공
  - 3일 x 5관측소 = 15행 확인
- ECMWF Open Data(0~15일) 실제 다운로드 성공
  - 파일 확인: `data/ecmwf_open_0_15/ecmwf_open_hres_20260413_00z_0_360h.grib2`
- `run_weekly_forecast.py`는 `--input` 필수로 정리 완료
- 더미 CSV 제거 및 문서 정리 완료

### 수정된 버그
- `data_sources/asos_api.py`에서 `station_id` 중복 컬럼 충돌로 인한 `TypeError` 수정
  - 원인: API 원본 `stnId` + 수동 `station_id` 주입 중복
  - 조치: 수동 주입 제거 + 중복 컬럼 제거 처리

### 남은 TODO (핵심)
1. `daily_feature_table` 생성 스크립트 연결 (ASOS + sales 일단위 조인)
2. `weekly_feature_table` 생성 스크립트 연결 (주간 집계)
3. 16~46일(`data_sources/ecmwf_extended.py`) 실구현
4. 필요 시 GRIB 파싱(`cfgrib/xarray`) 경로 안정화

---

## 5) 환경/의존성 주의사항

### 가상환경별 패키지 차이
- 동일 PC여도 가상환경(`panda` 등)마다 설치 패키지가 다르다.
- 실제로 아래 오류가 발생한 적 있음:
  - `ModuleNotFoundError: No module named 'ecmwf'`
- 해결:
  - **해당 활성 환경에서** `pip install ecmwf-opendata`

### `.env` 관련
- `.env`는 템플릿이 아니라 실제 런타임 파일
- 최소 필요:
  - `KMA_API_KEY=<기상청 디코딩 키>`
  - (필요 시) `ECMWF_URL`, `ECMWF_KEY`, `ECMWF_EMAIL`

### `.gitignore` 현재 상태
- `.env`, `.ecmwfapirc`, `/data/`, `*.grib`, `*.grib2`, `.cache/` 제외 처리됨

---

## 6) 이동 후 즉시 해야 할 작업 (`C:\gl-dashboard`)

1. 폴더 이동 후 Cursor에서 `C:\gl-dashboard`를 워크스페이스로 다시 연다.
2. 아래 문서부터 먼저 확인:
   - `HANDOFF_FOR_MOVE_GL_DASHBOARD.md` (본 문서)
   - `HANDOFF_PROGRESS.md`
3. 활성 가상환경 확인 후 의존성 설치:
   - `pip install -r requirements.txt`
   - `pip install ecmwf-opendata`
4. 실검증 재확인:
   - ASOS 스모크 테스트 1회
   - ECMWF 0~15일 다운로드 1회

---

## 7) 재실행 커맨드 모음

### ASOS (5관측소) 스모크 테스트
```bash
python -c "from data_sources.asos_api import fetch_asos_multi_station_daily, STATIONS; df=fetch_asos_multi_station_daily('2026-04-01','2026-04-03',stations=STATIONS); print(df.head()); print('rows=',len(df)); print('stations=',df['station_id'].nunique())"
```

### ECMWF 0~15일 (고정 run)
```bash
python -c "from data_sources.ecmwf_loader import fetch_ecmwf_open_data_0_15_days; print(fetch_ecmwf_open_data_0_15_days('20260413',0,'./data/ecmwf_open_0_15'))"
```

### ECMWF 0~15일 (최근 가용 run 자동 탐색)
```bash
python -c "from data_sources.ecmwf_loader import fetch_latest_available_open_data_0_15_days; print(fetch_latest_available_open_data_0_15_days(lookback_days=5,out_dir='./data/ecmwf_open_0_15'))"
```

### 예측 CLI 확인
```bash
python scripts/run_weekly_forecast.py --help
```

---

## 8) 다음 구현 우선순위 제안

1. `scripts/build_feature_tables.py` 신설
   - 입력: `sales_daily.csv`, ASOS 수집 결과
   - 출력: `daily_feature_table.csv`, `weekly_feature_table.csv`
2. `weekly_feature_table.csv`로 `run_weekly_forecast.py` 실제 1회 실행
3. `ecmwf_extended.py`에 자격증명 파싱 + 16~46일 최소 다운로드 구현

---

## 9) 보안 메모
- API 키/이메일은 채팅/문서/코드에 원문 노출 금지.
- 이미 노출한 키는 가능하면 폐기/재발급 권장.
- `.env`, `.ecmwfapirc`는 절대 커밋하지 않는다.

