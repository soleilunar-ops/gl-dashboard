# HOTPACK_SEASON.md — 핫팩 시즌 분석 시스템

> 🎯 **이 문서의 역할**: GL 핫팩 시즌 분석 프로젝트의 **독립 진입점**.
> 핫팩·시즌·기상·키워드·사이드바 페이지 관련 작업을 할 때 먼저 읽는다.
> 최종 갱신: 2026-04-21

---

## 1. 프로젝트 한 줄 정의

**GL 핫팩 브랜드의 쿠팡 판매 × 서울 기상 × 네이버 검색량을 시즌(9월~3월)마다 자동 갱신 분석하는 Supabase-native 시스템.**

- 입력: 쿠팡 CSV/XLSX (수동 업로드) · 기상청 ASOS 실측/단기/중기예보 (자동) · 네이버 데이터랩 (자동)
- 저장: Supabase Postgres (`project_id: sbyglmzogaiwbwfjhrmo`)
- 분석: Supabase VIEW + 트리거 로직 + LLM 프롬프트
- 출력: **사이드바 페이지**에서 쿼리 → 시즌 리포트, 급증 경보, 안전재고 산출

---

## 2. 🟢 자동화 상태 (운영 중)

### 매일 KST 자동 실행

| 시간     | 잡                                | 동작                       | 상태 |
| -------- | --------------------------------- | -------------------------- | :--: |
| 06:00    | `sync-keyword-trends-daily`       | 네이버 검색지수 최근 30일  |  ✅  |
| 07:00    | `sync-weather-asos-daily`         | 기상청 ASOS 실측 최근 7일  |  ✅  |
| 07:30    | `sync-weather-short-daily`        | 기상청 단기예보 D+1~5      |  ✅  |
| 08:00    | `sync-weather-mid-daily`          | 기상청 중기기온예보 D+3~10 |  ✅  |
| 월 05:00 | `sync-keyword-trends-weekly-full` | 네이버 시즌 전체 재수집    |  ✅  |

**핵심 비용: 0원** (Supabase Free tier + 공공 API 무료 할당량)

운영 상세는 [`AUTOMATION_STATUS.md`](./AUTOMATION_STATUS.md) 참조.

---

## 3. 사이드바 페이지 작업 가이드 🎯

### 3.1 공통 원칙

- **raw 테이블 쿼리 금지.** 반드시 `v_hotpack_*` / `v_keyword_*` 뷰 경유
- 시즌 경계는 `fn_current_season()` 또는 `season_config`에서 조회 (하드코딩 금지)
- 디자인은 `VISUAL_REFERENCE.md` 토큰 준수
- 레이아웃·톤은 `hotpack_weather_dashboard.html` (25시즌 완성본) 스타일 참조
- 한글 깨짐 방지: UTF-8, SQL 리터럴에 `\uXXXX` 금지

### 3.2 페이지별 핵심 데이터 소스

| 페이지 성격                       | 주로 쓸 뷰/함수                                      | 비고                                       |
| --------------------------------- | ---------------------------------------------------- | ------------------------------------------ |
| **시즌 대시보드** (핫팩 주 화면)  | `v_hotpack_season_daily`, `v_hotpack_season_stats`   | 기존 HTML 대시보드 레퍼런스                |
| **예보 + 실측 뷰어** (D-7 ~ D+10) | `weather_unified` (source 필터)                      | `asos` / `forecast_short` / `forecast_mid` |
| **트리거 알람**                   | `v_hotpack_triggers`, `v_hotpack_trigger_effects`    | 오늘/내일 발동 여부                        |
| **키워드 검색량**                 | `v_keyword_trends_active`, `v_keyword_daily_with_ma` | 5개 키워드 + MA                            |
| **데이터 건강도**                 | `v_hotpack_data_freshness`, `v_cron_job_status`      | 관리자용                                   |
| **임계값 튜닝**                   | `trigger_config` (직접 UPDATE)                       | 뷰 수정 불필요                             |
| **시즌 선택/비교**                | `season_config`, `fn_current_season()`               | 24/25/26시즌                               |
| **쿠팡 업로더**                   | (미구현) `excel_uploads`, `bulk-insert`              | P1 과제                                    |

### 3.3 자주 쓸 쿼리 스니펫 (페이지 개발용)

```sql
-- 현재 시즌 확인
SELECT * FROM fn_current_season();

-- 시즌 × 일별 판매 + 기온 (대시보드 핵심)
SELECT * FROM v_hotpack_season_daily
WHERE season = '25시즌' ORDER BY sale_date;

-- 시즌 KPI 요약
SELECT * FROM v_hotpack_season_stats WHERE season = '25시즌';

-- 실측 + 단기 + 중기 병합 조회 (10일 뷰용)
SELECT weather_date, source, forecast_day,
       temp_min, temp_max, temp_avg, precipitation
FROM weather_unified
WHERE station = '서울'
  AND weather_date BETWEEN CURRENT_DATE - 7 AND CURRENT_DATE + 10
ORDER BY weather_date, source;

-- 오늘 발동된 트리거
SELECT * FROM v_hotpack_triggers WHERE trigger_date = CURRENT_DATE;

-- 키워드 7일 이동평균 + 배수
SELECT * FROM v_keyword_daily_with_ma
WHERE trend_date >= CURRENT_DATE - 30;

-- 데이터 최신성 모니터
SELECT * FROM v_hotpack_data_freshness;
```

---

## 4. 핵심 자산 카탈로그

### Supabase (`project_id: sbyglmzogaiwbwfjhrmo`)

#### 테이블

| 테이블                 | 역할                                              | 주의                             |
| ---------------------- | ------------------------------------------------- | -------------------------------- |
| `sku_master`           | GL 브랜드 쿠팡 SKU 마스터                         |                                  |
| `daily_performance`    | 일별 SKU 판매 실적                                | 업로더 파이프라인 경유 필수      |
| `weather_unified`      | 기상 통합 (asos/era5/forecast_short/forecast_mid) | `UNIQUE NULLS NOT DISTINCT` 적용 |
| `season_config`        | 시즌 경계 정의                                    | 24/25(closed)/26시즌 등록        |
| `keyword_catalog`      | 추적 키워드 카탈로그                              | `is_active` 토글                 |
| `keyword_trends`       | 네이버 일별 검색지수                              |                                  |
| `station_catalog`      | 관측소 매핑 (ASOS/격자/중기 코드)                 | 서울만 `is_active=true`          |
| `trigger_config`       | 트리거 임계값                                     | UPDATE만                         |
| `weather_daily_legacy` | 🗄️ 은퇴                                           | DROP 가능                        |

#### 뷰

| 뷰                          | 역할                                    |
| --------------------------- | --------------------------------------- |
| `v_hotpack_skus`            | 34 SKU 자동 분류                        |
| `v_hotpack_season_daily`    | 시즌×일별 통합 (판매+기온)              |
| `v_hotpack_season_stats`    | 시즌 KPI (r_log, peak, first_freeze 등) |
| `v_hotpack_data_freshness`  | 데이터 최신성 모니터                    |
| `v_keyword_trends_active`   | 활성 키워드 시계열                      |
| `v_keyword_daily_with_ma`   | 키워드 7일 이동평균 + 배수              |
| `v_hotpack_triggers`        | 날짜별 4개 트리거 플래그                |
| `v_hotpack_trigger_effects` | 시즌×트리거별 배수·정밀도               |
| `v_cron_job_status`         | cron 잡 마지막 실행 상태                |

#### 함수

| 함수                                             | 역할                                    |
| ------------------------------------------------ | --------------------------------------- |
| `fn_current_season()`                            | 현재/최근 시즌 (active/upcoming/closed) |
| `trigger_sync_keyword_trends(days_back, season)` | pg_cron 헬퍼                            |
| `trigger_sync_weather_asos(days_back)`           | pg_cron 헬퍼                            |
| `trigger_sync_weather_short()`                   | pg_cron 헬퍼                            |
| `trigger_sync_weather_mid()`                     | pg_cron 헬퍼                            |

#### Edge Functions

| 이름                     | verify_jwt |                             상태                             |
| ------------------------ | :--------: | :----------------------------------------------------------: |
| `sync-keyword-trends`    |     ✅     |                           🟢 운영                            |
| `sync-weather-asos`      |     ✅     |                           🟢 운영                            |
| `sync-weather-short`     |     ✅     |                           🟢 운영                            |
| `sync-weather-mid`       |     ✅     |                           🟢 운영                            |
| `fetch-weather-daily`    |     ✅     |              🚫 deprecated, Dashboard 삭제 권장              |
| `diag-kma-mid`           |     ✅     |             🚫 진단용 임시, Dashboard 삭제 권장              |
| `bulk-insert`            |     ❌     |                     🟡 유지 (검토 필요)                      |
| `propose-trigger-tuning` |     ✅     | 🟠 예정 — 시즌 `is_closed` 전환 시 LLM 튜닝 제안 생성 (Opus) |
| `generate-season-brief`  |     ✅     |     🟠 예정 — 주간 cron + 수동 시즌 분석 리포트 (Sonnet)     |

#### Vault / Secrets

| 종류        | 이름                                      | 용도                                     |
| ----------- | ----------------------------------------- | ---------------------------------------- |
| Vault       | `sync_keyword_trends_auth`                | pg_cron → 네이버 Edge Function           |
| Vault       | `sync_weather_asos_auth`                  | pg_cron → 기상청 3개 Edge Function 공유  |
| Edge Secret | `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` | 네이버 DataLab                           |
| Edge Secret | `KMA_API_KEY`                             | 기상청 3개 API 공유                      |
| Edge Secret | `ANTHROPIC_API_KEY`                       | LLM 공용 (진희·나경·지호 공유)           |
| Edge Secret | `ANTHROPIC_TUNING_MODEL`                  | 튜닝 제안용 (기본 `claude-opus-4-7`)     |
| Edge Secret | `ANTHROPIC_SEASON_BRIEF_MODEL`            | 시즌 브리프용 (기본 `claude-sonnet-4-6`) |

### 관련 문서

| 파일                             | 역할                    |
| -------------------------------- | ----------------------- |
| `HOTPACK_SEASON.md`              | 🎯 본 문서 (진입점)     |
| `AUTOMATION_STATUS.md`           | 자동화 운영 매뉴얼      |
| `TRIGGER_LOGIC.md`               | 트리거 임계값 근거      |
| `hotpack_season_runbook.md`      | 사이드바 운영 매뉴얼    |
| `EDGE_FUNCTION_SETUP.md`         | Edge Function 초기 세팅 |
| `VISUAL_REFERENCE.md`            | 시각화 디자인 토큰      |
| `hotpack_weather_dashboard.html` | 25시즌 시각화 레퍼런스  |

---

## 5. 작업 규칙

### DB 변경

- DDL은 반드시 Supabase MCP `apply_migration` (execute_sql 금지)
- 마이그레이션 이름 snake_case · 시맨틱
- 뷰/함수 수정은 `CREATE OR REPLACE`

### ⚠️ 한글 인코딩 (이 세션에서 실제로 겪은 버그)

- **apply_migration SQL에 한글을 `\uXXXX` 이스케이프로 쓰면 안 됨.**
  Postgres 문자열 리터럴은 `\u` 미해석 → 12자 리터럴로 저장됨
- ✅ **한글은 그대로 입력**: `VALUES ('서울', ...)`
- ✅ 사후 확인: `SELECT LENGTH(col)` — 한글 지명 2자 vs 깨진 값 12자

### 쿼리

- 분석은 **반드시 `v_hotpack_*` / `v_keyword_*` 뷰 경유**
- 시즌 경계는 `season_config`에서 조회 (하드코딩 금지)
- 예보 분석 시 `source`로 필터: `asos` / `forecast_short` / `forecast_mid`

### 자동화 관련

- Vault 시크릿 확인 시 값 출력 금지. 형식(`len`, `dot_count`)만 검증
- Edge Function Secrets 반영 안 될 땐 **재배포**로 해결
- `UNIQUE NULLS NOT DISTINCT` 필수

### 임계값 조정

- `trigger_config` UPDATE만 (뷰 수정 불필요)
- `keyword_catalog.is_active` 토글로 키워드 on/off

---

## 6. 로드맵 — 우선순위

### P0 — 완료 ✅

- [x] 기상청 ASOS 실측 자동 동기화
- [x] 기상청 단기예보 자동 동기화 (D+1~5)
- [x] 기상청 중기기온예보 자동 동기화 (D+3~10)
- [x] 네이버 검색지수 자동 동기화
- [x] 트리거 로직 레이어 4종

### P1 — 현재 진행 ⏳

- [ ] **사이드바 페이지 구축** ← 지금 시작
  - [ ] 시즌 대시보드 페이지 (25시즌 HTML을 동적으로)
  - [ ] 10일 예보 + 실측 병합 뷰어
  - [ ] 트리거 알람 페이지
  - [ ] 키워드 검색량 페이지
  - [ ] 데이터 건강도 관리자 페이지
- [ ] **예보 병합 뷰** — `v_weather_forecast_merged` (D+1~3 단기 / D+4~10 중기)
- [ ] **쿠팡 CSV/XLSX 업로더** — `excel_uploads` → `daily_performance`
- [ ] **LLM 튜닝 제안 워크플로** — `propose-trigger-tuning` Edge Function + `trigger_tuning_proposals` 테이블 + PM 승인 UI (Opus)
- [ ] **LLM 시즌 브리프** — `generate-season-brief` Edge Function + 주간 cron + 슬라이드오버 (Sonnet)

### P2 — 시즌 중 운영 후 검토

- [ ] 트리거 재검증 (26시즌 한 달 축적 후)
- [ ] 급락/첫 돌파 즉시 알림 (Slack/이메일)
- [ ] 시즌 회고 리포트 생성기
- [ ] 다지역 확장

---

## 7. 25시즌 기준선 (헬스체크용)

| 지표                     | 값         | 비고                  |
| ------------------------ | ---------- | --------------------- |
| `r_log` (기온↔판매 상관) | **−0.832** | 시즌 헬스체크 기준    |
| `peak_units`             | 51,882     | 2025-12-03, −8.1℃     |
| `first_freeze`           | 2025-11-17 | 전주 대비 2.67배 폭발 |
| cold_shock 정밀도        | 100% (7/7) | 2.68× 배수            |

새 시즌이 이 숫자들과 얼마나 다른지가 헬스체크.

---

## 8. 금지사항

- `daily_performance`, `weather_unified`, `keyword_trends` 직접 INSERT 금지
- `season_config` 임의 수정 금지
- `v_hotpack_*`, `v_keyword_*` 뷰 이름 변경 금지
- Vault 시크릿 이름 변경 금지
- **apply_migration SQL에 한글 `\uXXXX` 이스케이프 사용 금지**
