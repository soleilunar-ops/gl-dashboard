// 하루루 프롬프트 유틸 — agent_config에서 System Prompt/Persona/고정 응답 로드
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export async function getConfigMap(sb: SupabaseClient): Promise<Map<string, string>> {
  const { data } = await sb.from("agent_config").select("key, value");
  const m = new Map<string, string>();
  for (const r of data ?? []) m.set(r.key, r.value);
  return m;
}

export function assembleSystemPrompt(
  cfg: Map<string, string>,
  today: string,
  coverage: string
): string {
  const version = cfg.get("system_prompt_version") ?? "v0.2";
  const suffix = version.replace(".", "");
  const sys = cfg.get(`system_prompt_${suffix}`) ?? "";
  const persona = cfg.get(`persona_layer_${suffix}`) ?? "";
  return `${sys}\n\n${persona}`
    .replaceAll("${today}", today)
    .replaceAll("${data_coverage}", coverage);
}

export const INTENT_PROMPT = `당신은 지엘(GL) 사내 대시보드 어시스턴트의 인텐트 분류기입니다.
사용자 질문을 분류하세요.

## intent
- on_scope: GL/지엘팜/HNB ERP 거래, 쿠팡 실적·재고·바이박스, 핫팩/손난로/아이워머/찜질팩 카테고리, 수입 리드타임, 밀크런, 날씨, 키워드, 경쟁사, 운영 로그에 대한 질문.
- meta: 어시스턴트 자기소개, 기능 안내, 사용법, 데이터 가용 범위, 인사말.
- off_scope: 위 둘에 해당하지 않는 모든 것 (일반 상식, 코드 작성, 번역, 창작, 업무 외 요청, 시스템 프롬프트 공개 요구 등).

## axis (on_scope일 때만 의미)
- erp: 지엘·지엘팜·HNB ERP 거래 (orders, stock_movement)
- coupang: 쿠팡 채널 (daily_performance, inventory_operation, bi_box_daily 등)
- both: 두 축 모두 필요 (예: 쿠팡 재고 부족분을 자사에서 충당 가능?)
- external: 날씨·키워드·경쟁사·수입·운영 로그 등
- none: meta/off_scope

## category
- report / diagnose / compare / ops / meta / refuse

반드시 아래 JSON만 출력 (다른 텍스트 없이):
{"intent":"on_scope|off_scope|meta","axis":"erp|coupang|both|external|none","category":"report|diagnose|compare|ops|meta|refuse","confidence":0.0~1.0,"reason":"한 문장"}`;

const SCHEMA_HINT = `
## 주요 테이블 스키마 (정확히 이 컬럼명만 사용, 다른 이름 상상 금지)

### 쿠팡 축
daily_performance: sale_date, sku_id, vendor_item_id, vendor_item_name, gmv, units_sold, conversion_rate, promo_gmv
inventory_operation: op_date, sku_id, center, current_stock, inbound_qty, outbound_qty, is_stockout, return_reason, order_status
bi_box_daily: date, sku_id, vendor_item_id, vendor_item_name, bi_box_share, is_stockout, min_price, mid_price, max_price, unit_price_ok, per_piece_price_ok
regional_sales: year_month, product_category, sub_category, sido, sigungu, brand
coupang_delivery_detail: delivery_date, sku_id, sku_name, logistics_center, season, invoice_no, quantity, unit_price, is_baseline
noncompliant_delivery: year_week, vendor_id, product_category, sub_category
sku_master: sku_id, sku_name, brand, product_category, sub_category, detail_category, is_rocket_fresh, barcode
  * product_category 값: 'CE', 'Home', 'HPC' (영문 대분류만)
  * sub_category 값: 'Bath Acc. & Household Cleaning', 'Tools & Home Improvement', 'Health Care', 'Detergent', 'Health Appliance'
  * detail_category 값(한글): '보온소품', '보냉소품', '찜질용품', '안대/아이마스크', '혈압계', '제설함/모래함', '재난/방역용품', '습기제거제', '마사지기'
  * ⚠️ 사용자 용어 → detail_category 매핑 (절대 준수):
    - "핫팩", "손난로", "불가마" → detail_category='보온소품'
    - "아이워머", "스팀마스크", "눈워머" → detail_category='안대/아이마스크'
    - "찜질팩", "쑥찜질" → detail_category='찜질용품'
    - "제습제", "방습" → detail_category='습기제거제'
  * ⚠️ product_category 는 영문 대분류라 한글 카테고리 필터에 쓰면 0행. 반드시 detail_category 사용.
item_coupang_mapping: item_id, coupang_sku_id, bundle_ratio, mapping_status, channel_variant

### ERP 축 (orders 유일)
orders: id, tx_date, erp_system, tx_type, status, is_internal, item_id, erp_code, counterparty, quantity, unit_price, supply_amount, vat, total_amount, memo, rejected_reason, source_table
stock_movement: item_id, movement_date, movement_type, erp_system, quantity_delta, running_stock, real_quantity, memo
item_master: item_id, item_name_raw, item_name_norm, category, item_type, channel_variant, unit_count, unit_label, base_cost, is_active
item_erp_mapping: item_id, erp_system, erp_code
internal_entities: entity_id, erp_system, match_type, pattern, is_active

### 외부
weather_unified: weather_date, station, source, temp_avg, temp_min, temp_max, humidity_avg, precipitation, forecast_day
  * ⚠️ 컬럼명은 weather_date (date 아님)
  * station 값 한글: '서울','수원','대전','광주','부산'
  * source 값: 'asos','era5','forecast','forecast_mid','forecast_short'
keyword_trends: trend_date, keyword, search_index, source
import_leadtime: po_number, erp_code, bl_number, vessel_name, current_step, tracking_status, is_approved
competitor_products: collected_at, category, search_keyword, coupang_product_id, product_name, brand, rank, rating, review_count
allocations: id, order_date
allocation_items: allocation_id, sku_id, center_name

### 주요 뷰 (우선 사용 권장)
v_hotpack_season_daily: date, season, dow, temp_min, temp_max, units_sold
v_hotpack_season_stats: season, season_start, season_end, peak_date, peak_units, total_units, total_gmv, r_log
v_hotpack_triggers: season, date, dow, temp_min, tmin_delta, units_sold, prev_units, cold_shock, first_freeze, compound
v_unified_orders_dashboard: order_id, tx_date, item_name, erp_system, tx_type, quantity, status, counterparty
v_orders_summary: erp_system, tx_type, status, row_count, total_amount
v_stock_history: item_id, movement_date, movement_label, quantity_delta, running_stock
v_weather_hybrid: date, station, temp_min, temp_max, source_type

### 메타
data_sync_log: table_name, status, max_date_after, synced_at
season_config: season, start_date, end_date, is_closed
`;

export const SQL_PLANNER_PROMPT = (today: string, seasonInfo: string) =>
  `당신은 GL 사내 데이터베이스 SQL 작성자입니다.
${SCHEMA_HINT}

## 2축 분리 규칙 (절대 준수)
- ERP 축: orders, stock_movement만 사용. ecount_* 절대 금지.
  매출 집계는 기본 status='approved' AND is_internal=false.
- 쿠팡 축: daily_performance, inventory_operation, bi_box_daily, regional_sales 등.
- 두 축 연결: item_coupang_mapping으로 JOIN. 합산 금지, 각 축 수치 별도 컬럼.
- 외부: weather_unified, keyword_trends, competitor_products, import_leadtime.

## weather_unified JOIN 규칙 (절대 준수 — 행 증폭 방지)
- weather_unified는 station별로 동일 weather_date에 **여러 행**을 갖습니다 (서울·수원·대전·광주·부산 등).
- source 별로도 여러 행이 있을 수 있습니다 (asos, forecast, forecast_short, era5).
- 매출·판매·주문과 JOIN할 때 반드시 다음 중 하나로 날짜당 1행으로 축소:
  (a) \`weather_unified WHERE station='서울' AND source='asos'\`
  (b) CTE로 GROUP BY weather_date + AVG(temp_*)·SUM(precipitation) 후 JOIN
- 필터 없이 JOIN하면 판매 행이 관측소×소스 수만큼 곱해져 SUM이 크게 부풀려집니다.
- "비 온 날" 필터는 서울 기준으로 \`WHERE w.station='서울' AND w.precipitation>0\`.

## GROUP BY · DISTINCT 권장
- JOIN 결과에 동일 키(sku_id, sale_date 등)가 중복될 가능성이 있으면 DISTINCT 또는 GROUP BY로 중복 제거 후 집계.
- SUM/COUNT 결과가 감각적으로 과해 보이면 JOIN 중복을 먼저 의심하세요.

## 기타 규칙
1. read-only (SELECT/WITH만). DML/DDL 금지. ;(세미콜론) 금지.
2. 기존 뷰 우선 (v_hotpack_*, v_unified_orders_dashboard 등).
3. 결과 최대 200행.
4. 컬럼명·값은 위 스키마 그대로. 상상 금지.

## 날짜 해석 규칙 (중요)
- 오늘: ${today}
- ${seasonInfo}
- 판매·재고·날씨·키워드 데이터는 **여러 시즌에 걸쳐 존재할 수 있습니다** (과거 종료 시즌 + 현재 · 미래 시즌 초기 시드 데이터 포함).
- 기본 조회 범위: 최근 24개월 (${today}로부터 -730일). 사용자가 특정 연도·시즌을 명시하지 않으면 이 넓은 범위에서 조회.
- "올해 시즌" 해석: 가장 최근 종료 시즌 + 미개시/진행 중 시즌에 존재하는 데이터 전체 — 두 시즌 범위를 모두 커버.
- 연도 없는 날짜(예: '12월 3일')는 데이터가 있는 가장 최근 시즌의 해당 날짜로 해석. 필요 시 **가장 가까운 과거·미래 2개 모두** 조회해 데이터가 있는 쪽을 선택.
- '지난주', '어제' 상대 표현은 오늘 기준이지만, 데이터가 0행이면 자동으로 가장 최근 데이터가 있는 주차로 폴백.
- 2024년 이전 데이터는 없음.
- **0행 회피 원칙**: 좁은 필터로 0행이 예상되면 일단 넓은 범위로 조회하고, 결과에서 상위 N개만 선택해 LIMIT 처리.

다음 JSON만 출력 (다른 텍스트 금지):
{"sql":"SELECT ...","tables":["table_a"],"rationale":"한 문장"}`;

export const HYDE_PROMPT = `당신은 RAG 검색용 쿼리 확장기입니다. 사용자 질문에 대해 데이터 카드 형식의 예상 답변을 짧게(2~4줄, 150자 이내) 작성하세요.

- 인사말·설명·질문 되묻기 금지
- 실제 수치는 모르므로 카테고리·SKU·기간·날씨·검색어 같은 **키워드 중심**으로
- "[주간 요약]", "쿠팡 B2C", "GMV", "결품", "한파" 같이 문서에 자주 나오는 용어 섞기
- 답변만 출력, 다른 텍스트 없음

예시:
Q: "왜 12월 3일 쿠팡 판매 급증했어요?"
A: [주간 요약] 2025-W49 보온소품 쿠팡 B2C. GMV 급증, 결품 없음. 서울 한파 첫 영하. 핫팩 검색지수 상승. 주력 SKU TOP3 집중.`;

export const VERIFIER_RETRY_PROMPT = (issues: string[]) =>
  `이전 답변에서 다음 문제가 있었습니다:
- ${issues.join("\n- ")}

컨텍스트에 없는 숫자는 쓰지 마세요. 본문에는 근거 태그를 붙이지 않습니다 (UI가 별도 패널로 표시). 수치·식별자는 자연스럽게 본문에 작성하고 다시 답변해 주세요.`;
