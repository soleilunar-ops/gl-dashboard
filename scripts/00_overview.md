# 00. 하루루 프로젝트 개요

> GL 하루온 재고·판매 대시보드에 탑재되는 사내 전용 AI 어시스턴트 **하루루**(HaruRu) 설계 문서 시리즈의 인덱스.

---

## 1. 한 줄 정의

**하루루는 지엘(GL) 사내 직원이 자연어로 대시보드 데이터를 조회·분석·리포트 생성할 수 있게 도와주는 SQL + RAG 기반 어시스턴트다.**

---

## 2. 페르소나

| 항목        | 값                                                      |
| ----------- | ------------------------------------------------------- |
| 이름        | 하루루 (HaruRu)                                         |
| 소속        | 지엘(GL) — 하루온 브랜드                                |
| 성격        | 밝은 어시스턴트. 차분한 분석가보다 친근한 동료 톤       |
| 언어        | 한국어 존댓말 기본                                      |
| 시각 캐릭터 | 팀원 작업 예정 (TBD)                                    |
| 배치 위치   | 대시보드 좌측 네비 또는 우측 플로팅 버튼 (UX 논의 필요) |

### 톤 규칙 요약

- 존댓말 기본 ("~해요", "~입니다")
- 데이터 필드명은 한글 라벨로 풀어 설명 (예: `cold_shock` → "갑작스러운 추위", `sku_id` → "쿠팡 SKU")
- 과장·추측 금지. 데이터에 없으면 "찾지 못했어요"
- 이모지는 **강조용으로만 최소 사용** (❄️ 한파, 📦 재고, ⚠️ 경고 정도)
- 상세 톤 예시는 `04_prompt_and_persona.md` 참조

---

## 3. 사용자

- **전원 사내 직원**. 미인증·외부 접근 없음
- 부서 구분 없이 전 직원 동일 권한 (초기 MVP 기준)
- 예상 동시 사용자 수: 10~30명
- 주 사용 채널: PC 웹 대시보드 (모바일은 후순위)

---

## 4. 2가지 핵심 유스케이스

### A. 주간 리포트 자동 생성

매주 월요일 새벽, 지난주 판매·재고·날씨·키워드 데이터를 종합한 리포트를 자동 생성. 대시보드 메인에서 확인 가능.

- **입력**: 시즌, 주차
- **출력**: `hotpack_llm_reports` 테이블에 `kind='weekly_brief'`로 적재
- **구성 요소**: 주간 KPI / 특이 이벤트 / 원인 해설 / 다음 주 주목 포인트
- **기반 함수**: 기존 `generate-season-brief` Edge Function 확장

### B. 대화형 SQL + RAG 에이전트 (하루루 채팅)

사용자가 자연어로 질문하면 SQL과 RAG를 병행해 답변. 범위 밖 질문은 정중히 거부.

예시 질문:

- "지난주 HK001 쿠팡 판매량 얼마였어요?" → SQL 직접 (쿠팡 축)
- "이번 달 지엘팜 매출 얼마예요?" → SQL 직접 (ERP 축, orders)
- "HK005 쿠팡 재고 부족한데 자사에서 충당 가능해?" → SQL (두 축 연결, 합산 아님)
- "주식 전망 알려줘" → 정중히 거부

---

## 5. 시스템 아키텍처 (개요)

```
사용자 질문
     ↓
[하루루 채팅 UI / 주간 리포트 버튼]
     ↓
[Edge Function: haruru-agent]
     ↓
┌────────────── LangGraph 선형 파이프라인 ──────────────┐
│                                                        │
│  intent → sql_plan → sql_exec → rag_retrieve → answer → verify
│                                                        │
└────────────────────────────────────────────────────────┘
     ↓                           ↓
[Supabase Postgres]      [pgvector RAG 저장소]
- public 스키마 뷰·테이블   - rag_glossary
- safe_run_sql RPC         - rag_analysis
                           - rag_events
                           (rag_docs는 Phase 2)
```

---

## 6. 데이터 모델 — 2축 구조 ⭐

하루루가 다루는 데이터는 **교차하지 않는 두 축**으로 분리된다. 이 경계가 하루루 답변의 핵심 규칙.

### ERP 축 (지엘 3법인 거래)

- **유일 소스**: `orders` 테이블 (이카운트 크롤링 원본 `ecount_*`는 사용하지 않음)
- **단위**: `item_master` 144개 내부 품목
- **포함 법인**: gl(지엘), glpharm(지엘팜), hnb
- **재고**: `stock_movement` (자사 본사 창고 실재고)
- **기존 뷰**: `v_unified_orders_dashboard`, `v_orders_summary`, `v_stock_history`

### 쿠팡 축 (쿠팡 채널)

- **소스**: `daily_performance` (B2C 판매), `coupang_delivery_detail` (쿠팡 납품), `inventory_operation` (쿠팡 센터 재고), `bi_box_daily` (바이박스), `regional_sales` (지역), `noncompliant_delivery` (납품 미준수)
- **단위**: `sku_master` 쿠팡 SKU (59개)
- **재고**: `inventory_operation` (쿠팡 풀필먼트 센터 재고)
- **기존 뷰**: `v_hotpack_season_stats`, `v_hotpack_season_daily`, `v_hotpack_triggers`

### 두 축의 유일한 연결고리

`item_coupang_mapping`이 "내부 `item_id` ↔ 쿠팡 `sku_id`"를 **1:N**으로 연결.

- **용도**: 보충(replenishment) 의사결정 — 쿠팡 재고 부족 시 자사 재고로 충당 가능한지 판단
- **금지**: 두 축의 수치를 합산(예: 쿠팡 B2C 판매 + ERP 판매 = 총 판매)하는 것은 의미 없음. 각자 관점이 다름

### 외부·공통 축 (축 무관)

- 날씨: `weather_unified`, `station_catalog`
- 키워드: `keyword_trends`, `keyword_catalog`
- 경쟁사: `competitor_products`
- 수입: `import_leadtime` (내부 item_master 기준)
- 운영 메타: `excel_uploads`, `data_sync_log`, `trigger_config`, `season_config`
- AI 산출물 (RAG 1순위): `hotpack_llm_reports`, `hotpack_day_analysis`, `coupang_sku_ai_analysis_snapshots`

---

## 7. 대상 범위 (In-Scope · Out-of-Scope)

### 포함 (SQL/RAG 대상)

- **ERP 축**: `orders`, `stock_movement`
- **쿠팡 축**: `daily_performance`, `coupang_daily_performance`, `inventory_operation`, `bi_box_daily`, `regional_sales`, `noncompliant_delivery`, `coupang_delivery_detail`, `allocations`, `allocation_items`, `promotion_milkrun_costs`
- **마스터**: `item_master`, `sku_master`, `item_erp_mapping`, `item_coupang_mapping`, `internal_entities`, `season_config`, `station_catalog`, `keyword_catalog`, `trigger_config`
- **외부 신호**: `weather_unified`, `keyword_trends`, `competitor_products`
- **수입**: `import_leadtime`
- **AI 산출물**: `hotpack_llm_reports`, `hotpack_day_analysis`, `coupang_sku_ai_analysis_snapshots`
- **운영**: `excel_uploads`, `data_sync_log`

### 제외 (Out-of-Scope)

- **이카운트 크롤링 원본 5개**: `ecount_sales`, `ecount_purchase`, `ecount_stock_ledger`, `ecount_production_receipt`, `ecount_production_outsource` — 크롤링 전체 데이터이며 `orders`로 매핑된 것만 하루루가 사용함
- **이카운트 엑셀 적재본**: `ecount_*_excel`, `ecount_glpharm_*_excel`, `ecount_hnb_*_excel` 일체
- **수요 예측**: `forecast_model_a`, `forecast_model_b`, `winter_validation` — 대시보드에서 수요예측 메뉴 제거됨
- **판촉 ROI**: `promotion_coupon_contracts`, `promotion_ad_costs`, `promotion_premium_data_costs`
- **Legacy·임시**: `weather_daily_legacy`, `inbound_staging`, `tmp_docs`

### 기능 제외

- 코드 작성·번역·창작·일반 상식·의학·법률·주식 등 회사 데이터 외 주제
- 데이터 **쓰기** (INSERT/UPDATE/DELETE) — 조회 전용
- 수요 예측·판촉 ROI 분석·미래 확정치 제공

---

## 8. 대시보드 네비게이션 매핑

```
주문
  ├─ 주문 관리           (orders, v_unified_orders_dashboard 기반)

분석
  ├─ 마진 산출
  └─ 핫팩 시즌           (v_hotpack_season_* 뷰 기반, 하루루 주요 참조 영역)

물류
  ├─ 총재고 현황         (두 축 재고 통합 표시)
  ├─ 수입 리드타임       (import_leadtime)
  ├─ 쿠팡 밀크런 관리    (allocations, coupang_delivery_detail)
  └─ 재작업일 날씨       (weather_unified)
```

**하루루 접근 위치**: 전 페이지에서 호출 가능한 플로팅 채팅 or 좌측 네비 최상단 (UX 확정 필요).

---

## 9. 기술 스택

| 레이어               | 기술                                           |
| -------------------- | ---------------------------------------------- |
| DB                   | Supabase Postgres 17                           |
| 벡터 검색            | pgvector 0.8.0 (HNSW 인덱스)                   |
| 스케줄러             | pg_cron 1.6.4                                  |
| 외부 HTTP            | pg_net 0.20.0                                  |
| 에이전트 런타임      | Deno Edge Functions                            |
| 오케스트레이션       | LangGraph (선형 그래프)                        |
| LLM (답변)           | Claude Sonnet 4.6 (`claude-sonnet-4-6`)        |
| LLM (요약·간단 응답) | Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) |
| 임베딩               | OpenAI `text-embedding-3-small` (1536차원)     |

---

## 10. 문서 구조 (Lite 플랜 · 6개)

| 파일                       | 내용                                                |
| -------------------------- | --------------------------------------------------- |
| `00_overview.md`           | 본 문서. 전체 개요·페르소나·2축 구조·범위           |
| `01_data_and_rag.md`       | 질문 골든셋 + 테이블/컬럼 분류 + RAG 스키마 DDL     |
| `02_pipeline.md`           | 수동 백필 스크립트 + 주간 cron 자동 갱신            |
| `03_agent.md`              | 골든셋 평가 + LangGraph 선형 파이프라인 + Tool 정의 |
| `04_prompt_and_persona.md` | 하루루 시스템 프롬프트 + 톤 예시 + 가드레일         |
| `05_rollout_and_risks.md`  | 출시 계획 + 리스크 Top 12 + 완화책                  |

---

## 11. 버전·변경 이력

| 버전 | 날짜       | 내용                                                                                                    |
| ---- | ---------- | ------------------------------------------------------------------------------------------------------- |
| v0.1 | 2026-04-22 | 초안. Lite 플랜                                                                                         |
| v0.2 | 2026-04-22 | ecount\_\* 5개 제외 확정, ERP/쿠팡 2축 구조 명시, status 분리 원칙, 리스크 11·12 추가, 모델명 오타 수정 |

---

## 12. 용어집

| 용어                               | 의미                                                                         |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| **하루루**                         | 본 어시스턴트 이름                                                           |
| **ERP 축**                         | `orders` 기반 3법인 거래 관점. 단위는 `item_master`                          |
| **쿠팡 축**                        | `daily_performance` 등 기반 쿠팡 채널 관점. 단위는 `sku_master.sku_id`       |
| **SKU**                            | 쿠팡 판매 단위 식별자 (`sku_master.sku_id`)                                  |
| **Item**                           | 내부 마스터 품목 (`item_master.item_id`, 144건)                              |
| **ERP**                            | gl / glpharm / hnb 3개 법인 회계 시스템                                      |
| **시즌**                           | 핫팩 시즌 (25시즌 = 2025 가을 ~ 2026 봄)                                     |
| **트리거**                         | 판매 급증 감지 규칙 (갑작스러운 추위·첫 영하·한파+영하 동시)                 |
| **보충(replenishment)**            | 쿠팡 센터 재고 부족 시 자사 본사 재고로 충당하거나 중국 수입 발주하는 플로우 |
| **청크(chunk)**                    | RAG에서 임베딩되는 텍스트 조각                                               |
| **골든셋**                         | 정답 라벨이 붙은 평가용 질문 세트                                            |
| **승인 상태**                      | `orders.status` ∈ {pending, approved, rejected} — 집계 시 항상 분리          |
| **EMBED/FILTER/METRIC/SYNTH/SKIP** | 컬럼 분류 태그 (상세는 `01_data_and_rag.md`)                                 |

---

## 13. 다음 단계

1. 01~05 문서 검토·확정
2. 마이그레이션 파일 작성 (01·03 문서의 DDL을 실제 `.sql` 파일로)
3. Edge Function 배포 (`rag-embed-missing`, `haruru-agent`)
4. 백필 실행 → baseline 평가 1회
5. 내부 알파 시작
