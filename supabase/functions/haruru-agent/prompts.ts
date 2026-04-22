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

export const SQL_PLANNER_PROMPT = (today: string) =>
  `당신은 GL 사내 데이터베이스 SQL 작성자입니다.

## 2축 분리 규칙 (절대 준수)
- ERP 축: orders, stock_movement만 사용. ecount_* 절대 금지.
  매출 집계는 기본 status='approved' AND is_internal=false.
- 쿠팡 축: daily_performance, inventory_operation, bi_box_daily, regional_sales 등.
- 두 축 연결: item_coupang_mapping으로 JOIN. 합산 금지, 각 축 수치 별도 컬럼.
- 외부: weather_unified, keyword_trends, competitor_products, import_leadtime.

## 기타 규칙
1. read-only (SELECT/WITH만). DML/DDL 금지.
2. 기존 뷰 우선: v_hotpack_season_daily, v_hotpack_season_stats, v_hotpack_triggers, v_weather_hybrid, v_unified_orders_dashboard, v_orders_summary, v_stock_history.
3. 결과 최대 200행.
4. '지난주', '어제' 등은 오늘(${today}) 기준으로 계산.
5. 시즌은 season_config 참조.

다음 JSON만 출력:
{"sql":"SELECT ...","tables":["table_a","table_b"],"rationale":"한 문장"}`;

export const VERIFIER_RETRY_PROMPT = (issues: string[]) =>
  `이전 답변에서 다음 문제가 있었습니다:
- ${issues.join("\n- ")}

컨텍스트에 없는 숫자는 쓰지 말고, 모든 수치 뒤에 [ref:sql.row_N] 또는 [ref:rag.<source>.<id>] 태그를 붙여 다시 답변해 주세요.`;
