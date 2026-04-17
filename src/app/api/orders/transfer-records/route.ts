import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

interface TransferRecordRow {
  purchase_id: string;
  advance_paid: boolean;
  remaining_paid_ratio: number;
  last_transfer_quantity: number | null;
  last_transfer_amount_cny: number | null;
  applied_rate: number | null;
  updated_at: string;
}

interface UpsertBody {
  purchaseId?: string;
  advancePaid?: boolean;
  remainingPaidRatio?: number;
  lastTransferQuantity?: number | null;
  lastTransferAmountCny?: number | null;
  appliedRate?: number | null;
}

function parseUpsertBody(raw: unknown): UpsertBody | null {
  if (raw === null || typeof raw !== "object") {
    return null;
  }
  const o = raw as Record<string, unknown>;
  return {
    purchaseId: typeof o.purchaseId === "string" ? o.purchaseId : undefined,
    advancePaid: typeof o.advancePaid === "boolean" ? o.advancePaid : undefined,
    remainingPaidRatio: typeof o.remainingPaidRatio === "number" ? o.remainingPaidRatio : undefined,
    lastTransferQuantity:
      typeof o.lastTransferQuantity === "number" || o.lastTransferQuantity === null
        ? (o.lastTransferQuantity as number | null)
        : undefined,
    lastTransferAmountCny:
      typeof o.lastTransferAmountCny === "number" || o.lastTransferAmountCny === null
        ? (o.lastTransferAmountCny as number | null)
        : undefined,
    appliedRate:
      typeof o.appliedRate === "number" || o.appliedRate === null
        ? (o.appliedRate as number | null)
        : undefined,
  };
}

function adminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }
  return createClient(supabaseUrl, serviceRoleKey);
}

export async function GET(request: Request) {
  const admin = adminClient();
  if (!admin) {
    return NextResponse.json(
      { message: "Supabase 서버 환경변수가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  const url = new URL(request.url);
  const purchaseIds = url.searchParams
    .getAll("purchaseId")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (purchaseIds.length === 0) {
    return NextResponse.json({ records: [] });
  }

  const { data, error } = await admin
    .from("order_transfer_states")
    .select(
      "purchase_id, advance_paid, remaining_paid_ratio, last_transfer_quantity, last_transfer_amount_cny, applied_rate, updated_at"
    )
    .in("purchase_id", purchaseIds);
  if (error) {
    return NextResponse.json(
      {
        message: "송금 기록 조회 실패",
        detail: error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ records: (data ?? []) as TransferRecordRow[] });
}

export async function POST(request: Request) {
  const admin = adminClient();
  if (!admin) {
    return NextResponse.json(
      { message: "Supabase 서버 환경변수가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ message: "JSON 본문을 읽을 수 없습니다." }, { status: 400 });
  }
  const body = parseUpsertBody(json);
  if (!body?.purchaseId) {
    return NextResponse.json({ message: "purchaseId가 필요합니다." }, { status: 400 });
  }
  if (
    body.remainingPaidRatio === undefined ||
    !Number.isFinite(body.remainingPaidRatio) ||
    body.remainingPaidRatio < 0 ||
    body.remainingPaidRatio > 1
  ) {
    return NextResponse.json(
      { message: "remainingPaidRatio는 0~1 범위여야 합니다." },
      { status: 400 }
    );
  }

  const payload = {
    purchase_id: body.purchaseId,
    advance_paid: body.advancePaid ?? true,
    remaining_paid_ratio: body.remainingPaidRatio,
    last_transfer_quantity: body.lastTransferQuantity ?? null,
    last_transfer_amount_cny: body.lastTransferAmountCny ?? null,
    applied_rate: body.appliedRate ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await admin
    .from("order_transfer_states")
    .upsert(payload, { onConflict: "purchase_id" });
  if (error) {
    return NextResponse.json(
      {
        message: "송금 기록 저장 실패",
        detail: error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: "송금 기록이 저장되었습니다." });
}
