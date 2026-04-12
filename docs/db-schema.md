# (주)지엘 하루온 스마트 재고 시스템 — DB 스키마

> 작성일: 2026.04.13
> Supabase: gl-dashboard-dev (ap-northeast-2)
> 마이그레이션: 001~012 적용 완료
> 데이터: v4 전체 8시트 → 9개 테이블 검증 완료 (23,268행)

---

## 테이블 현황 (24개)

### 🟢 실데이터 적재 완료 (9개)

| 테이블                  | 행 수  | 원본                   |
| ----------------------- | ------ | ---------------------- |
| products                | 144    | v4 시트1 품목 마스터   |
| sku_mappings            | 80     | v4 시트2 SKU 매핑      |
| inventory               | 144    | v4 시트1 현재고        |
| stock_movements         | 1,302  | v4 시트3 일별 입출고   |
| coupang_performance     | 12,492 | v4 시트4 쿠팡 일간성과 |
| coupang_logistics       | 5,813  | v4 시트5 쿠팡 물류     |
| coupang_regional_sales  | 3,283  | v4 시트6 지역별 판매   |
| product_monthly_summary | 144    | v4 시트7 품목별 요약   |
| data_collection_status  | 10     | v4 시트8 수집현황      |

### 🟡 ERP 데이터 대기 (5개) — erp_partners, erp_sales, erp_purchases, erp_production, erp_item_codes

### ⬜ 기능 개발 후 자동 (10개) — users, audit_log, forecasts, documents, document_chunks, alerts, weather_data, import_orders, shipping_quotes, container_specs

---

## 핵심 규칙

### 원가(unit_cost) 이중 저장

- products.unit_cost = 현재 원가 (새 입고 시 적용)
- inventory.unit_cost = 스냅샷 원가 (재고금액 계산 기준)

### 쿠팡 테이블 ↔ products 연결

쿠팡 테이블에 product_id FK 없음. sku_mappings 경유.
자사 품목별 쿠팡 매출은 근사치 (⚠️ 표시 필수).

### 재고 흐름

쿠팡 발주 → 지엘 출고(재고↓) → 쿠팡 입고 → 소비자 구매(매출).
자사 출고 시점 ≠ 쿠팡 매출 시점.

### 로그인: username@gl-local 방식 (Supabase Auth)

### category: 15개 CHECK 제약조건. 추가 시 PM이 ALTER

### coupang_sku_id: 모든 테이블 TEXT 통일

### RLS: 개발 중 임시 전체 허용. 인증 완성 후 강화

### types.ts: 30단계에서 CLI 자동생성으로 교체
