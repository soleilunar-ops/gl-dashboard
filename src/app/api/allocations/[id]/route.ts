// 변경 이유: Prisma 제거 후 단일 배정 상세·삭제를 Supabase 서버 클라이언트로 처리합니다.
import { createClient } from "@/lib/supabase/server";
import { computeAllocations } from "@/lib/milkrun-compute";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

async function createAllocationsSupabase(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient;
}

type AllocRow = {
  id: number;
  order_date: string;
  total_cost: number;
  total_pallets: number;
  center_count: number;
  memo: string | null;
  created_at: string;
};

type ItemRow = {
  center_name: string;
  basic_price: number;
  pallet_count: number;
  line_cost: number;
};

function ymdFromDb(value: string): string {
  return value.slice(0, 10);
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const supabase = await createAllocationsSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
  }

  const { id: idParam } = await context.params;
  const id = Number(idParam);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ message: "유효하지 않은 id입니다." }, { status: 400 });
  }

  const { data: rowRaw, error: errAlloc } = await supabase
    .from("allocations")
    .select("id, order_date, total_cost, total_pallets, center_count, memo, created_at")
    .eq("id", id)
    .maybeSingle();

  if (errAlloc) {
    return NextResponse.json(
      { message: errAlloc.message ?? "조회에 실패했습니다." },
      { status: 500 }
    );
  }

  const row = rowRaw as AllocRow | null;
  if (!row) {
    return NextResponse.json({ message: "데이터를 찾을 수 없습니다." }, { status: 404 });
  }

  const { data: itemRowsRaw, error: errItems } = await supabase
    .from("allocation_items")
    .select("center_name, basic_price, pallet_count, line_cost")
    .eq("allocation_id", id);

  if (errItems) {
    return NextResponse.json(
      { message: errItems.message ?? "조회에 실패했습니다." },
      { status: 500 }
    );
  }

  const itemRows = (itemRowsRaw ?? []) as unknown as ItemRow[];
  const inputs = itemRows.map((i) => ({
    name: i.center_name,
    basic: i.basic_price,
    pallets: i.pallet_count,
  }));
  const computed = computeAllocations(inputs);

  return NextResponse.json({
    id: row.id,
    orderDate: ymdFromDb(row.order_date),
    totalCost: row.total_cost,
    totalPallets: row.total_pallets,
    centerCount: row.center_count,
    memo: row.memo,
    createdAt: row.created_at,
    items: computed.rows.map((r) => ({
      centerName: r.name,
      basicPrice: r.basic,
      palletCount: r.pallets,
      lineCost: r.cost,
      sharePct: Math.round(r.sharePct * 10) / 10,
    })),
  });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const supabase = await createAllocationsSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
  }

  const { id: idParam } = await context.params;
  const id = Number(idParam);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ message: "유효하지 않은 id입니다." }, { status: 400 });
  }

  const { data: deleted, error } = await supabase
    .from("allocations")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) {
    return NextResponse.json({ message: error.message ?? "삭제에 실패했습니다." }, { status: 500 });
  }
  const delRows = deleted as unknown as { id: number }[] | null;
  if (!delRows?.length) {
    return NextResponse.json({ message: "데이터를 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
