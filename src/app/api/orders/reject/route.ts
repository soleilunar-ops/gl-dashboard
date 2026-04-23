// src/app/api/orders/reject/route.ts
// orders.status UPDATE 전용 라우트 (거절 / 거절 취소)
// - action='reject': status = 'rejected', rejected_reason 필수
// - action='unreject': status = 'pending', rejected_reason=null
// 요청: POST { orderIds: number[], action: 'reject' | 'unreject', reason?: string }

import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Database, TablesUpdate } from "@/lib/supabase/types";

interface Body {
  orderIds?: unknown;
  action?: unknown;
  reason?: unknown;
}

type ValidAction = "reject" | "unreject";

function parseBody(
  raw: unknown
): { orderIds: number[]; action: ValidAction; reason: string | null } | null {
  if (raw === null || typeof raw !== "object") return null;
  const o = raw as Body;
  if (!Array.isArray(o.orderIds) || o.orderIds.length === 0) return null;
  const orderIds = (o.orderIds as unknown[]).filter(
    (n): n is number => typeof n === "number" && Number.isInteger(n) && n > 0
  );
  if (orderIds.length === 0) return null;
  const action = o.action === "reject" || o.action === "unreject" ? o.action : null;
  if (action === null) return null;
  const reasonRaw = typeof o.reason === "string" ? o.reason.trim() : "";
  if (action === "reject" && reasonRaw === "") return null;
  return {
    orderIds,
    action,
    reason: reasonRaw === "" ? null : reasonRaw,
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
        error:
          "orderIds(양의 정수 배열) + action('reject' | 'unreject'). reject 시 reason(비어있지 않음) 필요",
      },
      { status: 400 }
    );
  }

  const admin = createAdmin<Database>(supabaseUrl, serviceRoleKey);

  const payload: TablesUpdate<"orders"> =
    parsed.action === "reject"
      ? {
          status: "rejected",
          rejected_reason: parsed.reason,
        }
      : {
          status: "pending",
          rejected_reason: null,
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
    message: parsed.action === "reject" ? "거절 완료" : "거절 취소 완료",
    updated: data?.length ?? 0,
    ids: data?.map((r) => r.id) ?? [],
  });
}
