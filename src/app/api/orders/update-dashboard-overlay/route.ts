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

  // --- 제조년도 변경 시 item_id 자동 재매핑 ---
  // 같은 SKU 그룹(item_name_norm + category + unit_count + unit_label)에서
  // 새 mfy 에 해당하는 manufacture_year의 item을 찾아 order.item_id 교체.
  // 승인 상태면 stock_movement.item_id도 이동 + 양쪽 item running_stock 재계산.
  let rematched: { from: number; to: number; year: string } | null = null;
  let rematchWarning: string | null = null;
  if (mfy !== undefined && prev.mfy !== next.mfy) {
    try {
      const { data: currentOrder } = await admin
        .from("orders")
        .select("id, item_id, status")
        .eq("id", orderId)
        .maybeSingle();
      if (currentOrder?.item_id) {
        const { data: currentItem } = await admin
          .from("item_master")
          .select("item_id, item_name_norm, category, unit_count, unit_label, manufacture_year")
          .eq("item_id", currentOrder.item_id)
          .maybeSingle();
        if (currentItem && currentItem.item_name_norm && currentItem.category) {
          const targetYear = `${String(next.mfy).slice(-2)}년`;
          if (currentItem.manufacture_year !== targetYear) {
            let q = admin
              .from("item_master")
              .select("item_id")
              .eq("item_name_norm", currentItem.item_name_norm)
              .eq("category", currentItem.category)
              .eq("manufacture_year", targetYear)
              .eq("is_active", true);
            if (currentItem.unit_count !== null) q = q.eq("unit_count", currentItem.unit_count);
            if (currentItem.unit_label !== null) q = q.eq("unit_label", currentItem.unit_label);
            const { data: candidates } = await q;
            if (!candidates || candidates.length === 0) {
              rematchWarning = `${targetYear} 제조연도의 동일 SKU가 없어 item 매칭을 유지합니다.`;
            } else if (candidates.length > 1) {
              rematchWarning = `${targetYear} 제조연도에 동일 SKU가 여러 개 있어 수동 확인이 필요합니다.`;
            } else {
              const newItemId = candidates[0].item_id;
              // order.item_id 업데이트
              const { error: itemUpErr } = await admin
                .from("orders")
                .update({ item_id: newItemId })
                .eq("id", orderId);
              if (itemUpErr) {
                rematchWarning = `item 교체 실패: ${itemUpErr.message}`;
              } else {
                rematched = {
                  from: currentOrder.item_id,
                  to: newItemId,
                  year: targetYear,
                };
                // 승인 상태면 stock_movement.item_id 이동 + 양쪽 running_stock 재계산
                if (currentOrder.status === "approved") {
                  await admin
                    .from("stock_movement")
                    .update({ item_id: newItemId })
                    .eq("source_table", "orders")
                    .eq("source_id", orderId);
                  // rpc 이름이 생성된 types.ts에 아직 없어 unknown 경유 캐스트
                  await (
                    admin as unknown as {
                      rpc: (
                        name: string,
                        args: Record<string, unknown>
                      ) => Promise<{ error: { message: string } | null }>;
                    }
                  ).rpc("recalc_running_stock_for_items", {
                    p_item_ids: [currentOrder.item_id, newItemId],
                  });
                }
              }
            }
          }
        }
      }
    } catch (e) {
      rematchWarning = e instanceof Error ? e.message : "item 재매핑 처리 중 오류";
    }
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

  if (rq !== undefined) {
    // real_quantity 동기화 — 변경 이유: 재고 승인 카드 입력값을 stock_movement 별도 컬럼에 저장
    const { error: smErr } = await admin
      .from("stock_movement")
      .update({ real_quantity: rq })
      .eq("source_table", "orders")
      .eq("source_id", orderId);
    if (smErr) {
      return NextResponse.json({ error: smErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    orderId,
    overlay: next,
    autoApproved,
    rematched,
    rematchWarning,
  });
}
