// 실입고 수량·송금액을 orders.memo 내 대시보드 오버레이(JSON)로 저장

import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Database, TablesUpdate } from "@/lib/supabase/types";
import {
  buildMemoWithOverlay,
  parseDashboardMemo,
  type DashboardMemoOverlay,
} from "@/lib/orders/orderDashMemo";

/** 이행 완료 여부 — 수량 또는 금액 축 중 하나라도 계약치 달성 시 true — 변경 이유: 업무 규칙(OR 달성 시 승인 완료) */
function isFulfillmentComplete(
  contractQty: number,
  contractAmt: number,
  rq: number,
  rm: number
): boolean {
  const qtyHit = contractQty > 0 && rq + 1e-6 >= contractQty;
  const amtHit = contractAmt > 0 && rm + 0.05 >= contractAmt;
  return qtyHit || amtHit;
}

/** memo에 넣을 이행률 % 스냅샷 — 변경 이유: 계약건별 진행률 조회 */
function snapshotFulfillmentPct(
  contractQty: number,
  contractAmt: number,
  rq: number,
  rm: number
): number | undefined {
  const pq = contractQty > 0 ? Math.min(100, (rq / contractQty) * 100) : null;
  const pa = contractAmt > 0 ? Math.min(100, (rm / contractAmt) * 100) : null;
  if (pq === null && pa === null) return undefined;
  const nums = [pq, pa].filter((v): v is number => v !== null);
  return Math.min(100, Math.max(...nums));
}

interface Body {
  orderId?: unknown;
  receivedQty?: unknown;
  remittanceAmount?: unknown;
  mfgYear?: unknown;
}

function parseNumber(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Supabase 서버 환경변수가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON 파싱 실패" }, { status: 400 });
  }

  const o = raw as Body;
  const orderId =
    typeof o.orderId === "number" && Number.isInteger(o.orderId) && o.orderId > 0
      ? o.orderId
      : null;
  if (orderId === null) {
    return NextResponse.json({ error: "orderId(양의 정수) 필요" }, { status: 400 });
  }

  const rq = parseNumber(o.receivedQty);
  const rm = parseNumber(o.remittanceAmount);
  const mfy = parseNumber(o.mfgYear);

  const admin = createAdmin<Database>(supabaseUrl, serviceRoleKey);

  const { data: row, error: fetchErr } = await admin
    .from("orders")
    .select("id, memo, quantity, total_amount, status")
    .eq("id", orderId)
    .maybeSingle();

  if (fetchErr || !row) {
    return NextResponse.json({ error: fetchErr?.message ?? "주문 없음" }, { status: 404 });
  }

  const prev = parseDashboardMemo(row.memo);
  const next: DashboardMemoOverlay = { ...prev };
  if (rq !== undefined) next.rq = rq;
  if (rm !== undefined) next.rm = rm;
  /** 제조년도만 사용 — 과거 저장된 월·일 필드 제거 */
  if (mfy !== undefined) {
    next.mfy = Math.round(mfy);
    delete next.mfm;
    delete next.mfd;
  }

  const cq = Number(row.quantity ?? 0);
  const ca =
    row.total_amount !== null && row.total_amount !== undefined ? Number(row.total_amount) : 0;
  const rqVal = next.rq ?? 0;
  const rmVal = next.rm ?? 0;
  next.fp = snapshotFulfillmentPct(cq, ca, rqVal, rmVal);

  const newMemo = buildMemoWithOverlay(row.memo, next);

  const { error: upErr } = await admin.from("orders").update({ memo: newMemo }).eq("id", orderId);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  let autoApproved = false;
  if (row.status === "pending" && isFulfillmentComplete(cq, ca, rqVal, rmVal)) {
    const approvePayload: TablesUpdate<"orders"> = {
      status: "approved",
      approved_by: user.email ?? user.id,
      approved_at: new Date().toISOString(),
      rejected_reason: null,
    };
    const { error: apErr } = await admin
      .from("orders")
      .update(approvePayload)
      .eq("id", orderId)
      .eq("status", "pending");
    if (!apErr) {
      autoApproved = true;
    }
  }

  return NextResponse.json({ ok: true, orderId, overlay: next, autoApproved });
}
