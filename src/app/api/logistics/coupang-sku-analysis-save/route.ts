// 쿠팡 SKU 모달 AI 재고 분석 텍스트 저장 — 리포트/이력용
// 변경 이유: 클라이언트에서 본문 길이·형식을 검증하고 RLS 하에 user_id와 함께 insert

import { createClient } from "@/lib/supabase/server";
import type { TablesInsert } from "@/lib/supabase/types";
import { NextResponse } from "next/server";

const MAX_BODY_CHARS = 500_000;

function isISODateString(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function isOptionalISODate(v: unknown): v is string | null | undefined {
  return v === null || v === undefined || isISODateString(v);
}

type SavePayload = {
  sku_id: string;
  center_label: string;
  center_query: string | null;
  sku_display_name: string | null;
  gl_erp_code: string | null;
  item_id: number | null;
  base_op_date: string;
  period_start: string | null;
  period_end: string | null;
  title: string;
  body_text: string;
};

function parsePayload(body: unknown): SavePayload | { error: string } {
  if (body === null || typeof body !== "object") {
    return { error: "JSON 본문이 필요합니다." };
  }
  const o = body as Record<string, unknown>;

  const sku_id = o.sku_id;
  const center_label = o.center_label;
  const body_text = o.body_text;
  const base_op_date = o.base_op_date;

  if (typeof sku_id !== "string" || !sku_id.trim()) {
    return { error: "sku_id가 필요합니다." };
  }
  if (typeof center_label !== "string" || !center_label.trim()) {
    return { error: "center_label이 필요합니다." };
  }
  if (typeof body_text !== "string" || !body_text.trim()) {
    return { error: "저장할 분석 본문(body_text)이 필요합니다." };
  }
  if (body_text.length > MAX_BODY_CHARS) {
    return { error: `본문은 ${MAX_BODY_CHARS.toLocaleString("ko-KR")}자 이하여야 합니다.` };
  }
  if (!isISODateString(base_op_date)) {
    return { error: "base_op_date는 YYYY-MM-DD 형식이어야 합니다." };
  }

  let center_query: string | null = null;
  if (o.center_query !== null && o.center_query !== undefined) {
    if (typeof o.center_query !== "string") {
      return { error: "center_query는 문자열이거나 null이어야 합니다." };
    }
    center_query = o.center_query;
  }

  let sku_display_name: string | null = null;
  if (o.sku_display_name !== null && o.sku_display_name !== undefined) {
    if (typeof o.sku_display_name !== "string") {
      return { error: "sku_display_name은 문자열이거나 null이어야 합니다." };
    }
    sku_display_name = o.sku_display_name;
  }
  let gl_erp_code: string | null = null;
  if (o.gl_erp_code !== null && o.gl_erp_code !== undefined) {
    if (typeof o.gl_erp_code !== "string") {
      return { error: "gl_erp_code는 문자열이거나 null이어야 합니다." };
    }
    gl_erp_code = o.gl_erp_code;
  }

  let item_id: number | null = null;
  if (o.item_id !== null && o.item_id !== undefined) {
    if (typeof o.item_id !== "number" || !Number.isInteger(o.item_id)) {
      return { error: "item_id는 정수이거나 null이어야 합니다." };
    }
    item_id = o.item_id;
  }

  const period_start = o.period_start;
  const period_end = o.period_end;
  if (!isOptionalISODate(period_start)) {
    return { error: "period_start는 YYYY-MM-DD 또는 null이어야 합니다." };
  }
  if (!isOptionalISODate(period_end)) {
    return { error: "period_end는 YYYY-MM-DD 또는 null이어야 합니다." };
  }

  const title = typeof o.title === "string" && o.title.trim() ? o.title.trim() : "재고 현황 분석";

  return {
    sku_id: sku_id.trim(),
    center_label: center_label.trim(),
    center_query,
    sku_display_name,
    gl_erp_code,
    item_id,
    base_op_date,
    period_start: period_start ?? null,
    period_end: period_end ?? null,
    title,
    body_text: body_text.trim(),
  };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON 파싱 실패" }, { status: 400 });
  }

  const parsed = parsePayload(json);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const row: TablesInsert<"coupang_sku_ai_analysis_snapshots"> = {
    user_id: user.id,
    sku_id: parsed.sku_id,
    center_label: parsed.center_label,
    center_query: parsed.center_query,
    sku_display_name: parsed.sku_display_name,
    gl_erp_code: parsed.gl_erp_code,
    item_id: parsed.item_id,
    base_op_date: parsed.base_op_date,
    period_start: parsed.period_start,
    period_end: parsed.period_end,
    title: parsed.title,
    body: parsed.body_text,
  };

  const { data, error } = await supabase
    .from("coupang_sku_ai_analysis_snapshots")
    .insert(row)
    .select("id, created_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: `저장 실패: ${error.message}` }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "저장 후 결과를 확인하지 못했습니다." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id, created_at: data.created_at });
}
