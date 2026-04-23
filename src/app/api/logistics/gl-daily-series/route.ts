// GL 창고 일별 입고·출고(orders) + 일말 재고추이(현재 총재고에서 역산)
// - 인증 필수, service_role로 RPC·뷰 조회

import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { NextResponse } from "next/server";

const MAX_SPAN_DAYS = 120;

function parseIsoDate(s: string | null): string | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function eachDateInclusive(from: string, to: string): string[] {
  const out: string[] = [];
  const a = new Date(`${from}T12:00:00`);
  const b = new Date(`${to}T12:00:00`);
  for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${day}`);
  }
  return out;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const url = new URL(request.url);
  const from = parseIsoDate(url.searchParams.get("from"));
  const to = parseIsoDate(url.searchParams.get("to"));
  if (!from || !to) {
    return NextResponse.json({ error: "from, to (YYYY-MM-DD)가 필요합니다." }, { status: 400 });
  }
  if (from > to) {
    return NextResponse.json({ error: "from이 to보다 늦을 수 없습니다." }, { status: 400 });
  }

  const span =
    (new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) /
      (86400 * 1000) +
    1;
  if (span > MAX_SPAN_DAYS) {
    return NextResponse.json(
      { error: `조회 기간은 최대 ${MAX_SPAN_DAYS}일까지입니다.` },
      { status: 400 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Supabase 서버 환경변수가 없습니다." }, { status: 500 });
  }

  const admin = createAdmin<Database>(supabaseUrl, serviceRoleKey);

  const { data: seriesRows, error: rpcErr } = await admin.rpc("gl_warehouse_daily_series", {
    p_from: from,
    p_to: to,
  });

  if (rpcErr) {
    const m = rpcErr.message ?? "";
    const friendly = /gl_warehouse_daily_series|schema cache|Could not find the function/i.test(m)
      ? "일별 입출고 집계가 아직 준비되지 않았습니다. DB에 최신 마이그레이션을 적용한 뒤 다시 시도해 주세요."
      : "집계 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
    return NextResponse.json({ error: friendly }, { status: 500 });
  }

  const byDay = new Map<string, { inbound: number; outbound: number }>();
  for (const raw of seriesRows ?? []) {
    const key = typeof raw.d === "string" ? raw.d.slice(0, 10) : String(raw.d).slice(0, 10);
    byDay.set(key, { inbound: Number(raw.inbound_qty), outbound: Number(raw.outbound_qty) });
  }

  const { data: stockRows, error: stockErr } = await admin
    .from("v_current_stock")
    .select("current_stock")
    .eq("is_active", true);

  if (stockErr) {
    return NextResponse.json({ error: `현재고 합계 실패: ${stockErr.message}` }, { status: 500 });
  }

  let totalGlStock = 0;
  for (const r of stockRows ?? []) {
    totalGlStock += r.current_stock ?? 0;
  }

  const calendarDays = eachDateInclusive(from, to);
  let e = totalGlStock;
  const stockEndByDay = new Map<string, number>();
  for (let i = calendarDays.length - 1; i >= 0; i -= 1) {
    const d = calendarDays[i];
    stockEndByDay.set(d, e);
    const row = byDay.get(d) ?? { inbound: 0, outbound: 0 };
    e = e - row.inbound + row.outbound;
  }

  const series = calendarDays.map((d) => {
    const row = byDay.get(d) ?? { inbound: 0, outbound: 0 };
    return {
      date: d,
      inbound: row.inbound,
      outbound: row.outbound,
      stockEnd: stockEndByDay.get(d) ?? 0,
    };
  });

  return NextResponse.json({
    from,
    to,
    totalGlStockEnd: totalGlStock,
    series,
  });
}
