/**
 * LLM이 습관적으로 넣는 Markdown(**, #, `, 링크, 단일 *)을 제거하고,
 * facts JSON 필드명이 본문에 그대로 붙는 `(key: value)`·`key: value` 잔재를 걷어낸다.
 */

/** CoupangSkuInsightFacts JSON 키와 동일한 토큰이 본문에 노출되지 않게 한다 */
const FACT_JSON_KEY_ALT =
  "displayName|sku_id|center|barcode|purchase_cost|gl_mapped|gl_stock|gl_base_cost|bundle_ratio|coupang_current_stock|coupang_is_stockout|order_status|order_status_detail|chart_from|chart_to|chart_day_count|total_inbound_in_range|avg_daily_inbound|total_outbound_in_range|avg_daily_outbound|stockout_streak_days|outbound_drop_detected|outbound_drop_boundary_date|outbound_early_avg|outbound_late_avg|outbound_late_to_early_ratio";

function stripFactJsonKeyEchoes(raw: string): string {
  let s = raw;
  const parenRe = new RegExp(String.raw`\s*\((?:${FACT_JSON_KEY_ALT})\s*:\s*[^)]+\)`, "g");
  for (let i = 0; i < 8; i += 1) {
    const next = s.replace(parenRe, "");
    if (next === s) break;
    s = next;
  }
  const bareBoolNullRe = new RegExp(
    String.raw`\b(?:${FACT_JSON_KEY_ALT})\s*:\s*(?:true|false|null)\b`,
    "gi"
  );
  s = s.replace(bareBoolNullRe, "");
  const bareNumRe = new RegExp(String.raw`\b(?:${FACT_JSON_KEY_ALT})\s*:\s*-?\d[\d,.]*\b`, "gi");
  s = s.replace(bareNumRe, "");
  const bareIsoDateRe = new RegExp(
    String.raw`\b(?:chart_from|chart_to|outbound_drop_boundary_date)\s*:\s*\d{4}-\d{2}-\d{2}\b`,
    "gi"
  );
  s = s.replace(bareIsoDateRe, "");
  s = s.replace(/\b(?:order_status|order_status_detail)\s*:\s*\S+(?:\s+\S+){0,3}/gi, "");
  const bareShortIdRe = new RegExp(
    String.raw`\b(?:center|sku_id|barcode)\s*:\s*\S+(?:\s+\S+){0,3}`,
    "gi"
  );
  s = s.replace(bareShortIdRe, "");
  s = s.replace(/\bdisplayName\s*:\s*[^\n]{1,240}/gi, "");
  return s
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .replace(/\s+\./g, ".")
    .replace(/\(\s*\)/g, "")
    .trim();
}

export function stripAiMarkdownNoise(text: string): string {
  let s = text.trim();
  let prev = "";
  while (s !== prev) {
    prev = s;
    s = s.replace(/\*\*([\s\S]*?)\*\*/g, "$1");
    s = s.replace(/__([\s\S]*?)__/g, "$1");
  }
  s = s.replace(/^#{1,6}\s+/gm, "");
  s = s.replace(/\*\*/g, "");
  s = s.replace(/`([^`]+)`/g, "$1");
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  s = s.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "$1");
  s = stripFactJsonKeyEchoes(s);
  s = s.replace(/쿠팑/g, "쿠팡");
  s = s.replace(/재고·판매 현황/g, "재고 현황");
  s = s.replace(/재고\s*·\s*판매\s*현황/g, "재고 현황");
  return s.replace(/\n{3,}/g, "\n\n").trim();
}
