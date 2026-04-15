# Supabase DB 분석 보고서

> 분석 일시: 2026-04-15
> 프로젝트: gl-dashboard-dev (ap-northeast-2)
> PostgreSQL: 17.6.1.104

---

## 1. 전체 현황 요약

| 항목                | 수                           |
| ------------------- | ---------------------------- |
| 테이블 (BASE TABLE) | 39개                         |
| 뷰 (VIEW)           | 3개                          |
| RPC 함수            | 5개                          |
| Foreign Key         | 16개                         |
| 인덱스              | 88개                         |
| RLS 정책            | 48개 (24테이블 x READ/WRITE) |
| 데이터 있는 테이블  | 21개                         |
| 빈 테이블           | 18개                         |
| 총 행 수            | ~25,500행                    |

---

## 2. 테이블별 데이터 현황

### 데이터 있음 (21개)

| 테이블                     | 행 수  | 설명                                 | 팀원 사용                       |
| -------------------------- | ------ | ------------------------------------ | ------------------------------- |
| `coupang_performance`      | 12,492 | 쿠팡 일간 종합 성과 (55 SKU, 1년)    | 나경(리뷰/프로모션), 정민(예측) |
| `coupang_logistics`        | 5,813  | 쿠팡 물류 Rocket (45 SKU, 5센터)     | 진희(물류)                      |
| `coupang_regional_sales`   | 3,283  | 쿠팡 지역별 판매 (18시도, 233시군구) | -                               |
| `coupang_deliveries`       | 1,463  | 쿠팡 발주/납품 상세                  | 진희(물류)                      |
| `stock_movements`          | 1,301  | 일별 입출고 이력                     | 슬아(주문), 진희(물류)          |
| `product_monthly_summary`  | 288    | 월별 결산                            | -                               |
| `milkrun_center_rates`     | 272    | 136센터 팔레트 단가                  | 슬아(마진 계산)                 |
| `_backup_products_mapping` | 144    | 백업 (참조용)                        | -                               |
| `inventory`                | 144    | 현재 재고 스냅샷 (품목당 1행)        | 진희(물류)                      |
| `products`                 | 144    | 품목 마스터 (144개 품목)             | 전원                            |
| `staging_products`         | 144    | 임시: 엑셀 파싱 검증용               | PM                              |
| `coupang_fillrate`         | 120    | 주차별 납품률/미준수                 | -                               |
| `_backup_sku_mappings`     | 80     | 백업 (참조용)                        | -                               |
| `sku_mappings`             | 80     | 자사-쿠팡 SKU 매핑 (64매핑+80미확인) | 정민(예측)                      |
| `coupang_promo_events`     | 45     | 프로모션 이벤트 계약                 | 나경(프로모션)                  |
| `coupang_packaging`        | 32     | 품목별 포장규격/팔레트               | 슬아(마진)                      |
| `coupang_returns`          | 29     | 회송+반품 (3시트 통합)               | -                               |
| `coupang_sku_prices`       | 14     | SKU별 매입가/공급가                  | 슬아(마진)                      |
| `coupang_promo_monthly`    | 14     | 월별 쿠폰/광고/밀크런 비용           | 나경(프로모션)                  |
| `data_collection_status`   | 10     | 데이터 수집 상태 추적                | PM                              |
| `reprocessing_costs`       | 9      | 수입 재작업 단가                     | 슬아(마진)                      |

### 빈 테이블 (18개)

| 테이블                   | 설명                         | 상태             |
| ------------------------ | ---------------------------- | ---------------- |
| `forecasts`              | 수요 예측 결과               | 정민님이 채울 곳 |
| `weather_data`           | 날씨 데이터                  | 정민님이 채울 곳 |
| `erp_sales`              | ERP 판매 전표 (8,452건 예정) | 데이터 로드 대기 |
| `erp_purchases`          | ERP 구매현황 (549건 예정)    | 데이터 로드 대기 |
| `erp_production`         | ERP 생산입고 (1,166건 예정)  | 데이터 로드 대기 |
| `erp_item_codes`         | ERP 품목코드 (1,312개 예정)  | 데이터 로드 대기 |
| `erp_partners`           | ERP 거래처 마스터            | 데이터 로드 대기 |
| `import_orders`          | 중국 수입 발주               | 슬아님 연동 예정 |
| `users`                  | 시스템 사용자                | Auth 연동 후     |
| `alerts`                 | 알림                         | 기능 구현 후     |
| `documents`              | RAG 문서                     | AI 연동 후       |
| `document_chunks`        | RAG 청크 (pgvector)          | AI 연동 후       |
| `product_weekly_summary` | 주간 결산                    | 자동 집계 예정   |
| `shipping_quotes`        | 해운 견적                    | 데이터 로드 대기 |
| `container_specs`        | 컨테이너 규격                | 데이터 로드 대기 |
| `audit_log`              | 감사 로그                    | 자동 기록 예정   |
| `staging_daily_inbound`  | 임시: 엑셀 일별입고          | PM               |
| `staging_daily_outbound` | 임시: 엑셀 일별출고          | PM               |

---

## 3. 테이블 관계 (Foreign Key)

```
products (144행) ← 중심 테이블
  ├── inventory (product_id → products.id)
  ├── stock_movements (product_id → products.id)
  ├── sku_mappings (product_id → products.id)
  ├── forecasts (product_id → products.id)
  ├── alerts (product_id → products.id)
  ├── import_orders (product_id → products.id)
  ├── erp_item_codes (product_id → products.id)
  ├── erp_sales (product_id → products.id)
  ├── erp_purchases (product_id → products.id)
  ├── erp_production (product_id → products.id)
  ├── product_monthly_summary (product_id → products.id)
  ├── product_weekly_summary (product_id → products.id)
  └── coupang_packaging (product_id → products.id)

erp_partners
  ├── erp_sales (partner_id → erp_partners.id)
  └── erp_purchases (supplier_id → erp_partners.id)

documents
  └── document_chunks (document_id → documents.id)
```

**FK가 없는 테이블 (독립):**

- `coupang_performance` — coupang_sku_id로 sku_mappings와 논리적 연결 (FK 없음)
- `coupang_logistics` — 동일
- `coupang_regional_sales` — 독립
- `coupang_deliveries` — 독립
- `coupang_fillrate` — 독립
- `coupang_returns` — 독립
- `coupang_promo_events` — 독립
- `coupang_promo_monthly` — 독립
- `coupang_sku_prices` — 독립
- `milkrun_center_rates` — 독립
- `reprocessing_costs` — 독립
- `weather_data` — 독립
- `data_collection_status` — 독립

---

## 4. 뷰 (3개)

| 뷰                        | 소스                                          | 용도                 |
| ------------------------- | --------------------------------------------- | -------------------- |
| `v_inventory_dashboard`   | products LEFT JOIN inventory                  | 재고 대시보드 (진희) |
| `v_coupang_daily_summary` | coupang_performance GROUP BY date             | 일간 요약 KPI        |
| `v_low_stock_alerts`      | products JOIN inventory WHERE stock <= safety | 안전재고 미달 알림   |

---

## 5. RPC 함수 (5개)

| 함수                     | 인자                               | 반환                                  | 용도                             |
| ------------------------ | ---------------------------------- | ------------------------------------- | -------------------------------- |
| `process_stock_movement` | product_id, type, qty, cost, notes | uuid                                  | 입출고 처리 + 재고 자동 업데이트 |
| `search_documents`       | query_embedding, threshold, count  | TABLE (chunk_id, content, similarity) | RAG 벡터 검색                    |
| `bulk_insert_deliveries` | data (jsonb)                       | integer                               | 배송 데이터 벌크 삽입            |
| `update_updated_at`      | (trigger)                          | trigger                               | updated_at 자동 갱신             |
| `rls_auto_enable`        | (event_trigger)                    | event_trigger                         | 새 테이블 RLS 자동 활성화        |

---

## 6. RLS 정책

**현재 상태: 개발 모드 (전체 개방)**

대부분의 테이블이 동일한 패턴:

```sql
-- READ: 누구나 조회 가능
CREATE POLICY "xxx_read" ON table FOR SELECT USING (true);

-- WRITE: 누구나 쓰기 가능
CREATE POLICY "xxx_write" ON table FOR ALL USING (true);
```

**예외: `users` 테이블만 역할 기반 제한**

```sql
-- 본인만 조회
CREATE POLICY "users_read_own" ON users FOR SELECT USING (auth.uid() = id);
-- 관리자는 전체 조회
CREATE POLICY "users_read_all_admin" ON users FOR SELECT
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));
```

> 프로덕션 배포 전 RLS 정책 강화 필요

---

## 7. 인덱스 현황

### 주요 성능 인덱스

| 테이블                | 인덱스                         | 컬럼                                          |
| --------------------- | ------------------------------ | --------------------------------------------- |
| `coupang_performance` | `idx_cp_perf_unique`           | (date, coupang_sku_id, vendor_item_id) UNIQUE |
| `coupang_performance` | `idx_cp_perf_date`             | date                                          |
| `coupang_performance` | `idx_cp_perf_sku`              | coupang_sku_id                                |
| `coupang_logistics`   | `idx_cp_logistics_stockout`    | is_stockout WHERE true (부분 인덱스)          |
| `stock_movements`     | `idx_movements_product_date`   | (product_id, date)                            |
| `forecasts`           | `idx_forecasts_product_date`   | (product_id, forecast_date)                   |
| `weather_data`        | `weather_data_date_region_key` | (date, region) UNIQUE                         |
| `document_chunks`     | `idx_chunks_embedding`         | embedding (ivfflat, cosine, lists=50)         |
| `inventory`           | `inventory_product_id_key`     | product_id UNIQUE                             |

---

## 8. Migration 정합성

| 구분                                   | 수            |
| -------------------------------------- | ------------- |
| 프로젝트 파일 (`supabase/migrations/`) | 9개 (001~009) |
| Supabase에 적용된 migration            | 21개          |
| 프로젝트에 없는 migration              | 12개          |

### 프로젝트에 있는 migration (9개)

| 파일                       | 내용                                                                   |
| -------------------------- | ---------------------------------------------------------------------- |
| 001_products_inventory     | products, inventory, stock_movements                                   |
| 002_coupang_performance    | coupang_performance                                                    |
| 003_coupang_logistics      | coupang_logistics                                                      |
| 004_coupang_regional_sales | coupang_regional_sales                                                 |
| 005_erp_tables             | erp_partners, erp_sales, erp_purchases, erp_production, erp_item_codes |
| 006_users_auth             | users, audit_log                                                       |
| 007_shipping_import        | import_orders, shipping_quotes, container_specs                        |
| 008_ai_rag                 | forecasts, weather_data, alerts, documents, document_chunks            |
| 009_rpc_views              | process_stock_movement, search_documents, 뷰 3개                       |

### Supabase에만 있는 migration (12개 — 프로젝트 파일 없음)

| migration                           | 내용                                                |
| ----------------------------------- | --------------------------------------------------- |
| 010_rls_policies_dev                | RLS 개발 정책                                       |
| 011_fix_sku_id_types                | SKU ID 타입 수정                                    |
| 012_category_constraint             | 카테고리 CHECK 제약                                 |
| create_new_tables_phase1            | 쿠팡 추가 테이블 (deliveries, fillrate, returns 등) |
| create_new_tables_phase2_coupang    | 쿠팡 가격/포장/프로모션 테이블                      |
| load_coupang_deliveries_batch1      | 데이터 로드                                         |
| load_deliveries_batch0              | 데이터 로드                                         |
| create_tmp_movements                | 임시 테이블                                         |
| create_bulk_insert_function         | bulk_insert_deliveries 함수                         |
| deliveries_raw_batch_0              | 데이터 로드                                         |
| create_bulk_load_lines_function     | 벌크 로드 함수                                      |
| create_tmp_sm_raw_and_bulk_function | 임시 테이블 + 함수                                  |

> 새 환경에서 `supabase db reset` 시 9개 migration만 실행되어 15개 테이블이 누락됨.
> 프로젝트 파일로 동기화 필요 (운영에는 영향 없음).

---

## 9. 팀원별 DB 사용 현황

### 슬아 (주문/원가)

| 사용 테이블                    | 현재 상태                                                      |
| ------------------------------ | -------------------------------------------------------------- |
| `stock_movements` (1,301행)    | 스켈레톤 `useOrders.ts`에서 조회하나 실제 미사용 (Mock 데이터) |
| `milkrun_center_rates` (272행) | `CENTER_RATES` 하드코딩으로 대체 (DB 미연결)                   |
| `coupang_packaging` (32행)     | 미사용                                                         |
| `coupang_sku_prices` (14행)    | 미사용                                                         |
| `reprocessing_costs` (9행)     | 미사용                                                         |
| `import_orders` (0행)          | 미사용                                                         |

### 나경 (리뷰/프로모션)

| 사용 테이블                      | 현재 상태                                              |
| -------------------------------- | ------------------------------------------------------ |
| `coupang_performance` (12,492행) | `useReviews.ts`, `usePromotion.ts`에서 실제 조회 중 ✅ |
| `coupang_promo_events` (45행)    | 미사용 (하드코딩 경쟁사 데이터로 대체)                 |
| `coupang_promo_monthly` (14행)   | 미사용                                                 |

### 진희 (물류) — submain 머지 불가 상태

| 사용 테이블                    | 현재 상태                                              |
| ------------------------------ | ------------------------------------------------------ |
| `inventory` (144행)            | 스켈레톤 `useInventory.ts` 미사용 (SQLite로 대체)      |
| `stock_movements` (1,301행)    | 스켈레톤 `useStockMovements.ts` 미사용 (SQLite로 대체) |
| `coupang_logistics` (5,813행)  | 미사용                                                 |
| `coupang_deliveries` (1,463행) | 미사용                                                 |

### 정민 (예측) — submain 머지 불가 상태

| 사용 테이블                      | 현재 상태                            |
| -------------------------------- | ------------------------------------ |
| `coupang_performance` (12,492행) | Supabase 미연결 (CSV 파일 직접 읽기) |
| `weather_data` (0행)             | 테이블 있으나 미사용 (자체 API 호출) |
| `forecasts` (0행)                | 테이블 있으나 미사용 (콘솔 출력)     |
| `sku_mappings` (80행)            | 미사용                               |

---

## 10. 주요 발견 사항

### 데이터 품질

- `coupang_performance`에 UNIQUE 인덱스 `(date, coupang_sku_id, vendor_item_id)` 있어 중복 방지 ✅
- `weather_data`에 UNIQUE 인덱스 `(date, region)` 있어 같은 날/지역 중복 방지 ✅
- `inventory`에 `product_id` UNIQUE 있어 품목당 1행 보장 ✅

### ERP 데이터 미로드

- `erp_sales` (0행) — 코멘트에 "8,452건" 예정이라 명시
- `erp_purchases` (0행) — "549건" 예정
- `erp_production` (0행) — "1,166건" 예정
- `erp_item_codes` (0행) — "1,312개" 예정
- `erp_partners` (0행)
- 이 5개 테이블은 데이터 로드 대기 중

### 쿠팡 테이블에 FK 없음

- `coupang_performance`, `coupang_logistics` 등은 `coupang_sku_id`로 `sku_mappings`와 논리적으로 연결되지만 FK 제약이 없음
- 데이터 정합성은 애플리케이션 레벨에서 관리 중

### RLS 개발 모드

- 모든 테이블이 `USING (true)` — 누구나 읽기/쓰기 가능
- `users` 테이블만 역할 기반 제한
- 프로덕션 배포 전 강화 필요

### pgvector 활성화

- `document_chunks.embedding`에 `ivfflat` 인덱스 (cosine, lists=50)
- RAG 검색용 `search_documents` 함수 준비됨
- 데이터는 아직 없음 (0행)
