# PM 작업 로그 — database

> Claude Code CLI 작업 내용이 기록됩니다.
> 일자별 로그는 시간순(과거 → 최신). 맨 아래 "미결 / 확인 필요 사항"은 지속 갱신.

---

### [2026-04-17] [진희 PR 정리·마이그레이션 동기화 시작]

**요청:** team/진희 → submain 병합 준비. 로컬 supabase/migrations/001~009는 폐기된 구버전이고, 원격 dev DB(`sbyglmzogaiwbwfjhrmo`)에는 baseline부터 새로 짜인 18개 마이그레이션이 등록된 상태. 로컬을 원격 기준으로 동기화 필요.
**현재 상태:**

- 로컬 파일: `001_products_inventory.sql` ~ `010_crawlingitems_inventory.sql` (10개)
- 원격 등록: `20260415184109_baseline_gl_schema_v1` 외 17개 (총 18개) — 신규 스키마(l0_item_master, l2_orders, l2_stock_movement, coupang_daily_views 등)
- 010 (`crawlingitems_inventory`)은 진희가 추가한 리드타임용. 원격 미적용. 적용 여부 PM 결정 대기 중.
  **계획:**

1. 원격 18개 마이그레이션 SQL을 `supabase_migrations.schema_migrations`에서 추출 → `supabase/migrations/{version}_{name}.sql`로 저장
2. 로컬 001~009 삭제
3. 010 처리 결정 후 반영
   **주의사항:** 다른 팀원 작업 영향 가능성 있어 PR 머지 전 슬아/정민/나경에게 알릴 것 (스키마 자체는 dev DB에 이미 적용됐으므로 코드 영향만 확인).

### [2026-04-17] [마이그레이션 동기화 완료]

**요청:** 위 작업 1단계(원격 18개 받기 + 001~009 삭제) 진행
**변경 파일:**

- 신규 18개: `supabase/migrations/{20260415184109~20260416174227}_*.sql` (baseline_gl_schema_v1 외 17개)
- 삭제 9개: `supabase/migrations/00{1..9}_*.sql`
  **변경 내용:** Supabase MCP `execute_sql`로 `supabase_migrations.schema_migrations`에서 SQL 추출 → 원격 명명 규칙(`{version}_{name}.sql`) 그대로 로컬 저장. 구버전 001~009 폐기.
  **상태:**
- 로컬 supabase/migrations/ = 원격 dev DB와 동기화 (010 제외)
- 010 (`crawlingitems_inventory.sql` — 진희 추가, 리드타임용 `import_leadtime` 테이블)은 보류 (코드 정리 후 결정)
  **주의사항:**
- 010 미적용 동안 `LeadTimeTracker`는 `NEXT_PUBLIC_LEADTIME_MOCK=true` 환경변수로 MOCK 모드 동작
- 010을 정식 채택하려면 새 명명 규칙(`20260417...`)으로 리네임 + Supabase 적용(apply_migration) 필요
- 010을 폐기하려면 LeadTimeTracker MOCK을 영구 모드로 변경하거나 기능 자체 비활성화 결정 필요

### [2026-04-17] [v6 스키마 변경 영향 분석 — 다른 팀원 코드 마이그레이션 가이드]

**요청:** 진희 PR 머지 직전 전수 타입체크에서 다른 팀원 hooks 7개 파일에 73개 타입 에러 발견. v6 스키마 재설계로 인한 영향 분석 + 팀원별 마이그레이션 가이드 작성.

**영향 범위:** `supabase/types.ts`(v6 신 스키마 반영 완료) 기준으로 구 테이블 참조가 전부 깨짐.

#### 폐기된 구 테이블 → 신 위치 (전체 매핑)

| 구 테이블                                | 폐기 사유                          | 신 위치                     |
| ---------------------------------------- | ---------------------------------- | --------------------------- |
| `products`                               | 144품목 마스터 통합 재설계         | `item_master`               |
| `stock_movements` (복수형)               | v6 명명 통일                       | `stock_movement` (단수형)   |
| `coupang_performance`                    | 컬럼 표준화 + 정규화               | `daily_performance`         |
| `inventory_snapshots`                    | base_date 기준 재고 모델로 변경    | `v_current_stock` (뷰)      |
| `transactions`, `scheduled_transactions` | orders + stock_movement로 분리     | `orders` + `stock_movement` |
| `forecasts`                              | 4-15 가이드 시점 임시. v6에서 폐기 | (미정 — PM 결정 대기)       |
| `weather_data`                           | 통합 재설계                        | `weather_unified`           |

---

#### 슬아 영역 — 마이그레이션 가이드

**1. `useOrders.ts` (`src/components/orders/_hooks/`)**

현재 코드:

```typescript
type StockMovement = Tables<"stock_movements">;
type Product = Tables<"products">;
type OrderRow = StockMovement & { products: Pick<Product, "name" | "erp_code"> | null };

await supabase
  .from("stock_movements")
  .select("*, products(name, erp_code)")
  .eq("movement_type", "출고")
  .order("created_at", { ascending: false })
  .limit(200);
```

신 스키마 권장:

```typescript
type StockMovement = Tables<"stock_movement">; // 단수형!
type ItemMaster = Tables<"item_master">;
type OrderRow = StockMovement & {
  item_master: Pick<ItemMaster, "item_name_raw" | "seq_no"> | null;
};

await supabase
  .from("stock_movement") // 단수형
  .select("*, item_master(item_name_raw, seq_no)")
  .lt("quantity_delta", 0) // 출고 = 음수
  .order("movement_date", { ascending: false }) // created_at → movement_date
  .limit(200);
```

**핵심 컬럼 매핑 (`stock_movements` → `stock_movement`):**

| 구                              | 신                          | 비고                                                                                |
| ------------------------------- | --------------------------- | ----------------------------------------------------------------------------------- |
| `movement_type` ('출고'/'입고') | `movement_type`             | 값 표준 확인 필요 (트리거가 'sale'/'return_sale' 등 ERP tx_type 그대로 사용 가능성) |
| (없음)                          | `quantity_delta`            | 출고 음수, 입고 양수                                                                |
| (없음)                          | `running_stock`             | 누적 재고                                                                           |
| (없음)                          | `source_table`, `source_id` | 'orders' 등 출처 테이블 추적                                                        |
| (없음)                          | `erp_system`                | 'gl'/'gl_farm'/'hnb'                                                                |
| `created_at` 정렬               | `movement_date` 정렬 권장   | created_at도 있지만 movement_date가 의미상 정확                                     |

**ERP 거래 원본을 직접 조회하려면:** `orders` 테이블 사용 (`tx_type='sale'`, `tx_date` 정렬, `quantity` + `total_amount` + `counterparty` + `memo`(구매자) 활용).

**2. `useCost.ts` (`src/components/analytics/cost/_hooks/`)**

현재 코드:

```typescript
type Product = Tables<"products">;
type CostRow = Pick<
  Product,
  "id" | "name" | "category" | "unit_cost" | "erp_code" | "coupang_sku_id"
>;

await supabase
  .from("products")
  .select("id, name, category, unit_cost, erp_code, coupang_sku_id")
  .order("name");
```

신 스키마 권장 (단순 매핑):

```typescript
type ItemMaster = Tables<"item_master">;
type CostRow = Pick<ItemMaster, "item_id" | "item_name_raw" | "category" | "base_cost" | "seq_no">;

await supabase
  .from("item_master")
  .select("item_id, item_name_raw, category, base_cost, seq_no")
  .eq("is_active", true)
  .order("seq_no");
```

**컬럼 매핑 (`products` → `item_master`):**

| 구               | 신                | 비고                                                                      |
| ---------------- | ----------------- | ------------------------------------------------------------------------- |
| `id`             | `item_id`         | PK 이름 변경                                                              |
| `name`           | `item_name_raw`   | 정규화 이름은 `item_name_norm`                                            |
| `category`       | `category`        | 동일                                                                      |
| `unit_cost`      | `base_cost`       | 실사일(2026-04-08) 기준 단가                                              |
| `erp_code`       | ❌ 단일 컬럼 폐기 | 3법인(gl/gl_farm/hnb) 별로 분리 → `item_erp_mapping` 별도 테이블에서 JOIN |
| `coupang_sku_id` | ❌ 단일 컬럼 폐기 | `item_coupang_mapping` 별도 테이블 (1:N 매핑)                             |

**erp_code/coupang_sku_id가 필요하면 (3가지 옵션):**

- (a) JOIN — `select("*, item_erp_mapping(erp_system, erp_code, confidence), item_coupang_mapping(sku_id, bundle_ratio)")`
- (b) `v_item_full` 뷰 — `gl_erp_code`, `gl_farm_erp_code`, `hnb_erp_code`, `coupang_mappings(jsonb)` 모두 평면화돼 있음. **단순 조회면 이게 가장 편함**.
- (c) `v_item_with_coupang_status` 뷰 — 쿠팡 매출/재고 30d 통계까지 한 번에 (cost 분석엔 과한 데이터)

---

#### 정민 영역 — 마이그레이션 가이드

**`useForecast.ts` (`src/components/analytics/forecast/_hooks/`)**

현재 코드:

```typescript
type CoupangPerformance = Tables<"coupang_performance">;

await supabase
  .from("coupang_performance")
  .select("*")
  .order("date", { ascending: false })
  .limit(100);
```

신 스키마 권장 — **테이블명만 바꾸면 거의 동일**:

```typescript
type DailyPerformance = Tables<"daily_performance">;

await supabase
  .from("daily_performance")
  .select("*")
  .order("sale_date", { ascending: false }) // date → sale_date
  .limit(100);
```

**컬럼 매핑 (`coupang_performance` → `daily_performance`):**

| 구                                                                                                                                                             | 신                 | 비고                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | --------------------------------- |
| `date`                                                                                                                                                         | `sale_date`        | 날짜 컬럼명 변경                  |
| `coupang_sku_id`                                                                                                                                               | `sku_id`           | 쿠팡 SKU ID                       |
| `sku_name`                                                                                                                                                     | `vendor_item_name` | 또는 sku_master JOIN으로 가져오기 |
| `gmv`, `units_sold`, `cogs`, `promo_gmv`, `coupon_discount`, `instant_discount`, `conversion_rate`, `page_views`, `review_count`, `avg_rating`, `return_units` | 동일 (그대로 사용) | 거의 동일                         |
| `promo_units`                                                                                                                                                  | `promo_units_sold` | 이름 변경                         |

**날씨 통합 분석은 별도로:** `v_sales_weather` 뷰 사용 — `daily_performance` + `weather_unified`를 sale_date+region 기준 미리 JOIN해놓은 뷰. 피처 엔지니어링에 그대로 활용 가능.

**4-15 가이드와의 차이:**

- 구 가이드의 `forecasts`/`weather_data` 테이블 **모두 v6에서 폐기됨**
- 예측 결과 저장 위치 → 신 스키마에 미정. **PM 결정 필요**: 새 테이블(`forecast_result`) 생성 vs `daily_performance`에 예측 컬럼 추가 vs 별도 ML pipeline 결과 저장소
- 날씨 데이터 → `weather_unified` 사용 (이미 통합 테이블 존재)

---

#### 나경 영역 — 마이그레이션 가이드

**1. `usePromotion.ts` (`src/components/analytics/promotion/_hooks/`)**

현재 코드:

```typescript
type CoupangPerformance = Tables<"coupang_performance">;
type PromoRow = Pick<
  CoupangPerformance,
  | "coupang_sku_id"
  | "sku_name"
  | "date"
  | "gmv"
  | "promo_gmv"
  | "promo_units"
  | "coupon_discount"
  | "instant_discount"
  | "units_sold"
>;

await supabase
  .from("coupang_performance")
  .select(
    "coupang_sku_id, sku_name, date, gmv, promo_gmv, promo_units, coupon_discount, instant_discount, units_sold"
  )
  .order("date", { ascending: false })
  .limit(500);
```

신 스키마 권장 (옵션 A: 원본 테이블 직접):

```typescript
type DailyPerformance = Tables<"daily_performance">;
type PromoRow = Pick<
  DailyPerformance,
  | "sku_id"
  | "vendor_item_name"
  | "sale_date"
  | "gmv"
  | "promo_gmv"
  | "promo_units_sold"
  | "coupon_discount"
  | "instant_discount"
  | "units_sold"
>;

await supabase
  .from("daily_performance")
  .select(
    "sku_id, vendor_item_name, sale_date, gmv, promo_gmv, promo_units_sold, coupon_discount, instant_discount, units_sold"
  )
  .order("sale_date", { ascending: false })
  .limit(500);
```

**옵션 B (권장 — ROI까지 미리 계산된 뷰):**

```typescript
await supabase
  .from("v_promo_roi")
  .select(
    "sku_id, vendor_item_id, sale_date, gmv, promo_gmv, promo_units_sold, total_discount, promo_roi, units_sold"
  )
  .order("sale_date", { ascending: false })
  .limit(500);
```

`v_promo_roi`는 `promo_roi` 자동 계산 + `total_discount = coupon_discount + instant_discount + coupang_extra_discount` 합산까지 해줌. PromotionDashboard 차트 단순화 가능.

**컬럼 매핑 추가:**

| 구                                                 | 신                             | 비고                              |
| -------------------------------------------------- | ------------------------------ | --------------------------------- |
| `promo_units`                                      | `promo_units_sold`             | 이름 변경                         |
| `coupon_discount + instant_discount` (UI에서 합산) | `total_discount` (v_promo_roi) | 뷰가 미리 합산                    |
| (없음)                                             | `promo_roi` (v_promo_roi)      | 신규 — promo_gmv / total_discount |

**2. `useReviews.ts` (`src/components/analytics/reviews/_hooks/`)**

현재 코드:

```typescript
type CoupangPerformance = Tables<"coupang_performance">;
type ReviewRow = Pick<
  CoupangPerformance,
  | "coupang_sku_id"
  | "sku_name"
  | "review_count"
  | "avg_rating"
  | "units_sold"
  | "return_units"
  | "date"
>;
```

신 스키마 권장:

```typescript
type DailyPerformance = Tables<"daily_performance">;
type ReviewRow = Pick<
  DailyPerformance,
  | "sku_id"
  | "vendor_item_name"
  | "review_count"
  | "avg_rating"
  | "units_sold"
  | "return_units"
  | "sale_date"
>;

await supabase
  .from("daily_performance")
  .select("sku_id, vendor_item_name, review_count, avg_rating, units_sold, return_units, sale_date")
  .order("sale_date", { ascending: false })
  .limit(500);
```

**review_count/avg_rating 그대로 `daily_performance`에 존재** — 추가 PM 협의 불필요. 단순 테이블/컬럼 이름만 교체.

---

#### CI/CD에서 자동 catch 가능 여부

- `.github/workflows/ci.yml` → `pull_request` 이벤트(opened/synchronize/reopened)에 `npx tsc --noEmit` + `npm run build` 실행
- **base 브랜치(submain)만 변경되어도는 자동 재실행 안 됨** (synchronize 트리거는 PR 브랜치 push 시에만)
- 진희 PR 머지 후 깨진 상태가 묻힐 위험 → 미결사항에 등록

**자동 감지 트리거 방법:**

1. PM이 GitHub PR 페이지에서 "Update branch" 클릭 (CI 재실행 강제)
2. 팀원이 자기 브랜치에 submain pull/rebase 후 push (synchronize 이벤트 발생)
3. branch protection의 "Require branches to be up to date before merging" 활성화 (머지 전 강제)

**주의사항:**

- 이 가이드는 `supabase/types.ts`가 v6 신 스키마 반영 완료된 상태 기준. 추후 스키마 재변경 시 `npm run gen:types`(또는 `auto-types.yml` workflow_dispatch)로 재생성 필요.
- 각 팀원이 본인 영역 수정만 가능 — PM이 직접 수정할 수 없음. 가이드 전달 후 본인이 마이그레이션 작업 수행 → PR 재제출 → CI 통과 확인.

### [2026-04-17 심야+] [크롤러 upsert 호환 UNIQUE 제약 교체]

**요청:** 브라우저에서 ERP 크롤링 시도 시 `there is no unique or exclusion constraint matching the ON CONFLICT specification` 에러 발생 → 원인 파악 + 정정.

**원인:**

- `ecount/route.ts:651`의 `upsert({onConflict:"erp_system,erp_tx_no,erp_tx_line_no"})`가 PG에 전달
- 기존 `orders_erp_tx_unique_idx`는 PARTIAL UNIQUE INDEX (`WHERE erp_tx_no IS NOT NULL AND erp_tx_line_no IS NOT NULL`)
- PG는 PARTIAL INDEX를 ON CONFLICT로 쓰려면 INSERT 측에도 동일 WHERE 절이 필요하나, Supabase JS `upsert({onConflict})`는 컬럼명만 전달 → 매칭 제약 없다고 거부

**변경 파일:** `supabase/migrations/20260417100000_fix_orders_erp_tx_unique_non_partial.sql`

**적용 DDL:**

1. `DROP INDEX orders_erp_tx_unique_idx` (PARTIAL)
2. `ADD CONSTRAINT orders_erp_tx_unique UNIQUE (erp_system, erp_tx_no, erp_tx_line_no)` (일반)
3. Fallback 인덱스 `orders_erp_tx_nolineno_idx`는 그대로 유지

**안전성 분석:**

- 기존 8,784행(gl_pharm 4,465 + hnb 4,319) 전부 `erp_tx_line_no` 채워져 있어 새 제약 위반 없음
- PG 기본 동작상 NULL은 서로 "다른 값" 취급 → PARTIAL WHERE 제거해도 다수 NULL 행 여전히 허용 (실질 동일)
- 코드/트리거/뷰 영향 없음

**검증:** `pg_constraint`에서 `orders_erp_tx_unique UNIQUE (erp_system, erp_tx_no, erp_tx_line_no)` 확인 완료.

### [2026-04-17 심야+] [gl_farm → gl_pharm 전체 치환]

**요청:** `erp_system` 값 `gl_farm` (지엘팜) → `gl_pharm` (pharmaceutical 명시)로 통일.

**영향 범위 전수 조사 결과:**

- DB CHECK 제약 2곳 (orders, item_erp_mapping)
- DB 데이터: orders 4,465행 + item_erp_mapping 144행 (stock_movement은 0건이라 NO-OP)
- 뷰 `v_item_full` (JOIN 조건 + 별칭 컬럼 3개)
- 코드 `src/components/logistics/_hooks/useInventory.ts:70` (주석 1줄만, 런타임 영향 0)
- 크롤러(`ecount/route.ts`)는 매핑 테이블 값 그대로 전달 → 하드코딩 없음
- 다른 팀원 코드: `gl_farm` 참조 0건

**변경 파일:** `supabase/migrations/20260417100001_rename_gl_farm_to_gl_pharm.sql`

**적용 단계 (트랜잭션 내):**

1. CHECK 제약 DROP (orders/item_erp_mapping)
2. UPDATE orders/item_erp_mapping/stock_movement SET erp_system='gl_pharm' WHERE erp_system='gl_farm'
3. CHECK 제약 재생성 (`IN ('gl','gl_pharm','hnb')`)
4. v_item_full 뷰 DROP + CREATE (별칭 `gl_pharm_erp_code`/`gl_pharm_confidence`/`gl_pharm_status`)
5. COMMENT 갱신 (item_erp_mapping, orders)

**후속 작업:**

- `supabase/types.ts` MCP `generate_typescript_types`로 재생성 (50,911자) → 뷰 컬럼 `gl_pharm_*` 반영 확인
- `useInventory.ts:70` 주석 치환
- `HANDOVER_2026-04-17_v6.md` 내 `gl_farm` 참조 일괄 치환

**검증:**

- `orders.erp_system` 분포: gl_pharm 4,465 / hnb 4,319 (gl_farm 0건) ✓
- `item_erp_mapping.erp_system` 분포: gl 144 / gl_pharm 144 / hnb 144 ✓
- `v_item_full` 컬럼: `gl_pharm_erp_code`/`gl_pharm_confidence`/`gl_pharm_status` ✓
- src/ 및 types.ts에 `gl_farm` 참조 0건 ✓ (4-16 역사 마이그레이션 파일에만 기록으로 잔존)

**주의사항:**

- 4-16 마이그레이션 파일(`20260416150937_create_l3_views.sql` 등)은 역사 기록이라 의도적으로 수정 안 함 — 새 환경에서 순차 적용 시 4-17 마이그레이션이 덮어씀.
- 진희 크롤러는 매핑 테이블 값 기반이므로 gl_pharm 기반 신규 거래 크롤링도 자동 동작.

---

## 🔴 미결 / 확인 필요 사항 (지속 갱신)

> 작업 중 발견된 미결 이슈, PM/팀원 확인이 필요한 사항을 모아둡니다.
> 해결되면 해당 항목을 지우거나 "✅ 해결됨 (날짜)" 표시 후 일자별 로그로 이동.
> 새 항목 추가 시 발견 일자 함께 기록.

### [PM 결정 대기]

- **(2026-04-17)** **010 마이그레이션(`import_leadtime`) 처리 결정**
  - 적용: 새 명명 규칙(`20260417...`)으로 리네임 + Supabase apply_migration. LeadTimeTracker MOCK env 해제.
  - 폐기: LeadTimeTracker MOCK 영구 모드 또는 기능 비활성화.
- **(2026-04-17)** **정민 예측 결과 저장소 신규 설계**
  - 4-15 가이드의 `forecasts` 테이블이 v6에서 폐기. 대안:
    - (a) 새 테이블 `forecast_result` 생성 (item_id/forecast_date/predicted_qty/model_name/input_features jsonb)
    - (b) `daily_performance`에 예측 컬럼 추가 (실측+예측 한 행)
    - (c) 별도 ML 결과 저장소(파일/Redis) — Supabase 외부
- **(2026-04-17)** **GitHub branch protection — "Require branches to be up to date before merging" 활성화 검토**
  - 활성화 시 머지 전 강제 rebase로 v6 같은 스키마 변경 누락 자동 차단
  - 비활성화 유지 시 PM이 매번 "Update branch" 수동 클릭 필요

### [PM 직접 작업 필요]

- **(2026-04-17)** 진희 submain 머지 직후 슬아/정민/나경 PR 페이지 "Update branch" 클릭 → CI 재실행 → 73개 타입 에러를 각 팀원이 인지하도록
- **(2026-04-17)** 010 마이그레이션 결정 후 PM이 직접 SQL 적용 + 파일 리네임
- **(2026-04-15 이월)** Migration 동기화 21개 vs 9개 — 4-17 동기화 작업으로 ✅ 해결됨 (현재 19개 동기화 완료, 010만 보류)

### [팀원 확인/작업 필요 — submain 머지 후 즉시 알림]

- **슬아 (2026-04-17)** v6 스키마 마이그레이션 (위 [슬아 영역] 가이드 참조)
  - `useOrders.ts`: `stock_movements`/`products` → `stock_movement`/`item_master` (단수형 주의)
  - `useCost.ts`: `products` → `item_master` 또는 `v_item_full` 뷰 권장
- **정민 (2026-04-17)** v6 스키마 마이그레이션 (위 [정민 영역] 가이드 참조)
  - `useForecast.ts`: `coupang_performance` → `daily_performance` (테이블명만 + `date` → `sale_date`)
  - 예측 결과 저장 위치는 PM 결정 대기 중 (위 [PM 결정 대기] 참조)
- **나경 (2026-04-17)** ✅ 해결됨 (2026-04-17): `usePromotion.ts` 삭제 + 리뷰 기능 제거로 v6 스키마 영향 자연 해소. 후속으로 `dataPreprocess.ts` xlsx → Supabase 마이그레이션 필요 (아래 [데이터 / 외부 의존성] 참조).
- **진희 (2026-04-17)** 010 마이그레이션 처리 결정 후 LeadTimeTracker 동작 확인

### [데이터 / 외부 의존성]

- **(2026-04-15 이월)** 슬아 — `CENTER_RATES` 20개 센터 밀크런 단가 하드코딩 → Supabase 센터 테이블 생성 후 DB 조회로 교체
- **(2026-04-15 이월)** 나경 — 경쟁사 가격/스펙 데이터, 키워드, 플랫폼 행사 정보 하드코딩. `competitor_products` 테이블이 4-16에 생성됨 → 마이그레이션 가능 시점 확인
- **(2026-04-15 이월)** 정민 — `services/api/` 폴더는 PM 전용. 정민님 코드 이동 시 PM이 폴더 생성 후 이관
- **(2026-04-15 이월)** 정민 — `docs/logs/정민.md` 미작성. 작성 요청
- **(2026-04-15 이월)** 나경 — `docs/logs/나경.md` 미작성. 작성 요청
- **(2026-04-17)** 나경 — `dataPreprocess.ts` xlsx 파싱(광고비/판매납품/프로모션 3개 엑셀) → Supabase 마이그레이션. `v_promo_roi` 뷰 + 광고비/판매납품 신규 테이블 설계 필요. 현재 임시 허용.
- **(2026-04-17)** 나경 — `promotion_dashboard/` Python Dash 정식 통합 결정 대기. 레포 미커밋 상태(나경 로컬 only). 팀 통합 시 폴더 commit + Python 환경 표준화 + 안전한 dev 스크립트 분리 필요.
- **(2026-04-17)** GL 본사 판매 103건 (`sales_gl_no_code.csv`) — 품목코드 없음, item_master.item_name_raw와 fuzzy 매칭 후 `erp_system='gl'`로 orders INSERT 필요
- **(2026-04-17)** 판매 미매칭 59개 코드 리뷰 (HNB 240400002 하루온손난로 63건, HNB 241200004 뉴하루온팩 47건, gl_farm 00062/00070/00053)
- **(2026-04-17)** 판매 0건 66개 품목 최종 조사 (GL 적재 후 데드스톡 사장님 보고 대상)

### [후속 정리 / 기술 부채]

- **(2026-04-17)** 4/9 이후 ERP 거래 Playwright 크롤링 파이프라인 설계 개시 (현재 ERP 재고수불부 크롤링은 `/api/crawl/ecount` 1회성, 정기 스케줄러 필요)
- **(2026-04-17)** 진희 PR 머지 후 010 명명(`010_*.sql`) → 새 명명 규칙(`20260417...`)으로 리네임 일관성 유지
- **(2026-04-17)** weather/route.ts 좌표 하드코딩 → 환경변수화, 타임존 명시 (frontend.md 미결과 중복 — 코드 위치는 PM 영역이라 양쪽 기록)

---

### [2026-04-18] [order_excel_upload_logs 테이블 생성 — 슬아 PR #20 재구축 Step 1]

**요청:** 슬아 원본 `012_order_excel_upload_logs.sql`(dev DB 미적용)을 v6+2단 RLS 정책과 일관되게 리네임 + 적용.

**변경 파일:**

- 삭제(로컬): `supabase/migrations/010_orders_schema_compat.sql`, `011_order_transfer_states.sql`, `013_item_erp_mapping.sql`, `014_products_pcs_per_pallet.sql`
- 리네임+재작성: `012_order_excel_upload_logs.sql` → `20260417183508_create_excel_upload_logs.sql` (서버 버전명 일치)
- 적용(dev DB): Supabase MCP `apply_migration name=create_excel_upload_logs` 1회

**변경 내용:**

- **신규 테이블** `public.order_excel_upload_logs` (id UUID, company_code TEXT, file_name TEXT, total_input/inserted_count/skipped_count INTEGER, created_at TIMESTAMPTZ)
- 인덱스 `idx_order_excel_upload_logs_company_created` (company_code, created_at DESC)
- RLS 활성 + 정책 `Allow all for authenticated users` (2단 전 테이블 공통 정책 일관)
- 슬아 원본 `012`의 anon `select_all` 정책 → `ALL` + `authenticated`로 변경 (anon 차단)

**주의사항:**

- 테이블 행수 0 (신규). `/api/orders/bulk-import-purchase-excel`이 엑셀 업로드 시 INSERT, `/api/orders/excel-upload-history`가 팝업에서 GET
- 서버 버전(20260417183508)과 로컬 파일명 일치 — `supabase migration list` 동기화 안전
- 010/011/013/014 폐기 이유:
  - **010** erp_purchases 생성: v6 `orders` 테이블로 일원화
  - **011** order_transfer_states: 송금 진행률 기능 보류 (2단 후속)
  - **013** item_erp_mapping: v6에 이미 432행 존재 (UNIQUE `(erp_system, erp_code)` 제약)
  - **014** products.pcs_per_pallet: `products` 테이블 없음 — 후속으로 `item_master.pcs_per_pallet` 컬럼 추가 필요 (후속 PR)

**연쇄 영향:**

- `supabase/types.ts` MCP로 재생성 (34개 마이그 반영, 1,884줄)
- `src/lib/supabase/types.ts` 헬퍼 확장 (`Tables<>`가 Views도 커버, `TablesInsert`/`TablesUpdate` alias 추가)
- 슬아 영역 hooks가 `v_orders_dashboard`/`v_item_full` 뷰 참조로 v6 인프라 활용
