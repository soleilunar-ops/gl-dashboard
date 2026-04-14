# 수요예측 데이터 파이프라인 진행 현황 (핸드오프)

> 폴더 이동(`C:\gl-dashboard`) 대비 확장 인수인계 문서: `HANDOFF_FOR_MOVE_GL_DASHBOARD.md`

## 목적
- 다른 Tool/에이전트가 현재 상태를 빠르게 파악하고 바로 이어서 작업할 수 있도록 중간 산출물과 이슈를 정리한다.

## 현재 상태 한 줄 요약
- 진행률: 약 70% (수집 모듈/인터페이스/실행 스크립트 정리 완료, 16~46일 실구현과 ASOS 실호출 검증 잔여)
- 핵심 이슈: `KMA_API_KEY` 미설정으로 ASOS 실호출 미검증, ECMWF S2S(16~46일)는 권한/라이선스 및 구현 TODO 상태
- 즉시 실행 명령:
  - `python scripts/run_weekly_forecast.py --help`
  - `python -c "from data_sources.ecmwf_loader import fetch_ecmwf_open_data_0_15_days; print(fetch_ecmwf_open_data_0_15_days('20260413',0,'./data/ecmwf_open_0_15'))"`
  - `python -c "from data_sources.asos_api import fetch_asos_multi_station_daily, STATIONS; df=fetch_asos_multi_station_daily('2026-04-01','2026-04-03',stations=STATIONS); print(df.head()); print(len(df))"`

## 이 프로젝트가 하는 일
- SKU 단위 수요예측 모델을 만들기 위한 **데이터 수집/피처 파이프라인**을 구축하는 프로젝트다.
- 최종 목표는 판매 데이터와 날씨/프로모션/재고/가격 정보를 결합해:
  - `daily_feature_table`
  - `weekly_feature_table`
  를 만들고, 이를 기반으로 주간 수요 예측(`weekly_sales_qty`)을 학습/추론하는 것이다.
- 현재 단계는 모델 고도화보다 먼저, **외부 데이터 연동 신뢰성**(수집, 표준화, 예외처리, 재현성)을 확보하는 데 초점을 둔다.

## 현재 구현 방식(아키텍처/전략)
- 데이터 소스는 이원화해서 운영한다.
  - **기상청(KMA ASOS)**: 과거/관측 기반 데이터 수집
  - **ECMWF 계열**: 미래 예보 데이터 수집
- ECMWF는 목적에 따라 2개 경로를 분리한다.
  - **빠른 실무 경로**: Open-Meteo HTTP (`openmeteo-requests`)로 일별 예보 조회
  - **원천/고급 경로**: `ecmwf-opendata`/S2S + GRIB 후처리(`xarray`/`cfgrib`)
- 구현 원칙:
  - API 키는 코드 하드코딩 금지 (`.env`, `~/.ecmwfapirc`, 환경변수 사용)
  - 더미데이터 생성 금지, 미확정 규칙은 TODO로 명시
  - 호출 함수/정규화 함수/저장 함수를 분리해 테스트 가능성 확보
  - 0~15일(운영)과 16~46일(확장)을 인터페이스 수준에서 미리 맞춰 확장성 확보

## 이번 세션에서 한 작업

### 1) 더미/샘플 데이터 정리
- 삭제:
  - `forecast_linear.csv`
  - `forecast_next_4weeks.csv`
  - `weekly_feature_table.csv`
- `scripts/run_weekly_forecast.py` 변경:
  - `--input` 인자를 필수(`required=True`)로 변경
  - 레포 내 샘플 CSV 없이 외부 산출물 경로를 받도록 수정
- `insight.html`:
  - 미검증 Mockup 내용 제거
  - TODO 중심의 최소 문서로 교체

### 2) Open-Meteo(ECMWF HTTP) 경로 추가/정리
- 추가: `data_pipeline/open_meteo_ecmwf.py`
  - `fetch_ecmwf_daily_forecast()`
  - `map_to_internal_feature_names()`
  - `openmeteo-requests` + `requests-cache` + `retry-requests` 사용
- `data_pipeline/weather_loader.py`:
  - Open-Meteo 일별 조회 함수 연결
  - 기상청 함수는 `kma_api`에서 re-export 하도록 정리

### 3) 기상청 API 분리
- 추가: `data_pipeline/kma_api.py`
  - 기상청 관련 엔드포인트 상수/파라미터 dataclass/호출 함수 골격
  - ASOS 일/시간, 단기, 중기, 수치모델, 특보 시그니처 정리
  - 일부는 TODO/NotImplemented 유지
- 추가: `scripts/kma_api_reference_samples.py`
  - 사용자 제공 requests 예시 보관용
  - `KMA_API_KEY` 환경변수 사용

### 4) data_sources 실수집 모듈 생성
- 추가: `data_sources/asos_api.py`
  - 함수:
    - `load_env()`
    - `fetch_asos_station_daily()`
    - `fetch_asos_multi_station_daily()`
    - `normalize_asos_columns()`
    - `save_as_csv()`
  - 5개 관측소(서울108/수원119/부산159/대전133/광주156) 수집 반영
  - JSON 파싱/응답 실패/빈데이터 예외 처리 포함
  - 메인 예시: `2023-01-01 ~ 오늘` 수집 후 `asos_daily_weather.csv` 저장

- 추가: `data_sources/ecmwf_loader.py`
  - 함수:
    - `validate_run_time()`
    - `build_target_path()`
    - `fetch_ecmwf_open_data_0_15_days()`
  - `ecmwf-opendata` 기반 0~15일(0~360h) 다운로드
  - GRIB2 저장, 명확한 실패 예외 메시지 구현

- 추가: `data_sources/ecmwf_extended.py`
  - 16~46일 확장용 placeholder 인터페이스
  - 함수:
    - `check_ecmwf_api_credentials()`
    - `fetch_ecmwf_extended_16_46_days(run_date, out_dir, area=None)`
    - `parse_grib_to_dataframe(grib_path)`
  - 현재 단계는 구조/계약 문서화 + TODO/NotImplemented

### 5) ECMWF GRIB 파이프라인 보강
- 추가: `data_pipeline/ecmwf_forecast_data.py`
  - 0~15일 Open Data 다운로드
  - 16~46일 S2S(placeholder+실행 틀)
  - GRIB -> long/wide/daily feature 변환 함수
- 추가: `scripts/ecmwf_open_pipeline.py`
  - 0~15일 다운로드 + CSV 저장 CLI
- 추가: `scripts/open_meteo_ecmwf_http_example.py`
  - Open-Meteo requests 최소 예시

### 6) 의존성/설정
- `requirements.txt`:
  - `requests`, `requests-cache`, `retry-requests`, `openmeteo-requests` 추가
  - ECMWF GRIB 관련 패키지는 선택 설치 주석 유지
- `.gitignore`:
  - `.cache/` 추가

## 점검/테스트 결과

### 정적 점검
- `python -m compileall .` 수행
  - 문법 오류 1건(`data_pipeline/kma_api.py` f-string) 수정 완료
- `ReadLints`: 주요 변경 파일 기준 오류 없음

### 실제 호출 테스트
- ECMWF Open Data(0~15일): 성공
  - 설치: `pip install ecmwf-opendata`
  - 결과 파일 확인:
    - `data/ecmwf_open_0_15/ecmwf_open_hres_20260413_00z_0_360h.grib2`
  - 참고: `20260414` run은 404, `20260413 00z`에서 성공

- 기상청 ASOS:
  - 실패 원인: `KMA_API_KEY` 미설정(코드 오류 아님)

## 현재 남은 이슈 / TODO
- `KMA_API_KEY` 설정 후 `data_sources/asos_api.py` 실호출 검증
- `data_sources/ecmwf_extended.py` 실제 구현
  - `~/.ecmwfapirc` 파싱
  - `ecmwf-api-client` 기반 16~46일 다운로드
  - GRIB 파싱(`cfgrib`/`xarray`) 연결
- `data_pipeline/kma_api.py` 내 TODO 함수(중기/특보 등) 점진적 구현

## 다음 Tool이 바로 실행할 명령

### 1) 환경 준비
```bash
pip install -r requirements.txt
pip install ecmwf-opendata
```

### 2) ASOS 실호출 검증
```bash
# .env 또는 환경변수에 KMA_API_KEY 필요
python -c "from data_sources.asos_api import fetch_asos_multi_station_daily, STATIONS; df=fetch_asos_multi_station_daily('2026-04-01','2026-04-03',stations=STATIONS); print(df.head()); print(len(df))"
```

### 3) ECMWF 0~15일 다운로드 검증
```bash
python -c "from data_sources.ecmwf_loader import fetch_ecmwf_open_data_0_15_days; print(fetch_ecmwf_open_data_0_15_days('20260413',0,'./data/ecmwf_open_0_15'))"
```

### 4) CLI 동작 확인
```bash
python scripts/run_weekly_forecast.py --help
python scripts/ecmwf_open_pipeline.py --help
python scripts/kma_api_reference_samples.py
```

## 보안 메모
- API 키/이메일은 코드/문서에 하드코딩하지 않는다.
- `.env`, `~/.ecmwfapirc`는 커밋 금지.
- 이미 노출된 키가 있다면 폐기/재발급 권장.

