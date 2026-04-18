// src/app/api/orders/approve/route.ts
// orders.status UPDATE 전용 라우트 (승인/승인 취소)
// - action='approve': status = 'approved', approved_by / approved_at 세팅
//   → DB 트리거가 stock_movement 자동 생성
// - action='unapprove': status = 'pending', approved 메타 초기화
//   → DB 트리거가 stock_movement 자동 DELETE
// 요청: POST { orderIds: number[], action: 'approve' | 'unapprove' }

import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Database, TablesUpdate } from "@/lib/supabase/types";

interface Body {
  orderIds?: unknown;
  action?: unknown;
}

type ValidAction = "approve" | "unapprove";

function parseBody(raw: unknown): { orderIds: number[]; action: ValidAction } | null {
  if (raw === null || typeof raw !== "object") return null;
  const o = raw as Body;
  if (!Array.isArray(o.orderIds) || o.orderIds.length === 0) return null;
  const orderIds = (o.orderIds as unknown[]).filter(
    (n): n is number => typeof n === "number" && Number.isInteger(n) && n > 0
  );
  if (orderIds.length === 0) return null;
  const action = o.action === "approve" || o.action === "unapprove" ? o.action : null;
  if (action === null) return null;
  return { orderIds, action };
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
  const parsed = parseBody(raw);
  if (!parsed) {
    return NextResponse.json(
      {
        error: "orderIds(양의 정수 배열) + action('approve' | 'unapprove') 필요",
      },
      { status: 400 }
    );
  }

  const admin = createAdmin<Database>(supabaseUrl, serviceRoleKey);

  const payload: TablesUpdate<"orders"> =
    parsed.action === "approve"
      ? {
          status: "approved",
          approved_by: user.email ?? user.id,
          approved_at: new Date().toISOString(),
          rejected_reason: null,
        }
      : {
          status: "pending",
          approved_by: null,
          approved_at: null,
        };

  const { data, error } = await admin
    .from("orders")
    .update(payload)
    .in("id", parsed.orderIds)
    .select("id, status");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    message: parsed.action === "approve" ? "승인 완료" : "승인 취소 완료",
    updated: data?.length ?? 0,
    ids: data?.map((r) => r.id) ?? [],
  });
}
