// 변경 이유: Prisma 제거 후 밀크런 배정 API를 Supabase 서버 클라이언트(세션·RLS)로 동작하게 합니다.
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/** `supabase/types`에 allocations 미반영 시에도 동일 세션으로 쿼리하기 위한 캐스트 */
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

function ymdFromDb(value: string): string {
  return value.slice(0, 10);
}

function normalizeYmd(value: string | null): string | null {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export async function POST(request: Request) {
  const supabase = await createAllocationsSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "JSON 본문이 필요합니다." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "유효하지 않은 요청입니다." }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const orderDateRaw = typeof record.orderDate === "string" ? record.orderDate : "";
  const orderDate = normalizeYmd(orderDateRaw);
  const memo = typeof record.memo === "string" ? record.memo : null;
  const itemsRaw = record.items;

  if (!orderDate) {
    return NextResponse.json({ message: "orderDate(YYYY-MM-DD)가 필요합니다." }, { status: 400 });
  }
  if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) {
    return NextResponse.json({ message: "items 배열이 필요합니다." }, { status: 400 });
  }

  const items: Array<{
    centerName: string;
    basicPrice: number;
    palletCount: number;
    lineCost: number;
  }> = [];

  for (const row of itemsRaw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const centerName = typeof r.centerName === "string" ? r.centerName.trim() : "";
    const basicPrice = Number(r.basicPrice);
    const palletCount = Number(r.palletCount);
    if (!centerName || !Number.isFinite(basicPrice) || basicPrice < 0) continue;
    if (!Number.isFinite(palletCount) || palletCount < 0) continue;
    const safePallets = Math.floor(palletCount);
    const safeBasic = Math.floor(basicPrice);
    const lineCost = safeBasic * safePallets;
    items.push({ centerName, basicPrice: safeBasic, palletCount: safePallets, lineCost });
  }

  if (items.length === 0) {
    return NextResponse.json({ message: "유효한 배정 행이 없습니다." }, { status: 400 });
  }

  const totalCost = items.reduce((s, i) => s + i.lineCost, 0);
  const totalPallets = items.reduce((s, i) => s + i.palletCount, 0);
  const centerCount = items.length;
  const memoTrimmed = memo?.trim() ? memo.trim() : null;

  const { data: parent, error: insErr } = await supabase
    .from("allocations")
    .insert({
      order_date: orderDate,
      total_cost: totalCost,
      total_pallets: totalPallets,
      center_count: centerCount,
      memo: memoTrimmed,
    })
    .select("id, order_date, total_cost, total_pallets, center_count, memo, created_at")
    .single();

  const row = parent as unknown as AllocRow | null;
  if (insErr || !row) {
    return NextResponse.json(
      { message: insErr?.message ?? "저장에 실패했습니다." },
      { status: 500 }
    );
  }

  const childPayload = items.map((i) => ({
    allocation_id: row.id,
    center_name: i.centerName,
    basic_price: i.basicPrice,
    pallet_count: i.palletCount,
    line_cost: i.lineCost,
  }));

  const { error: childErr } = await supabase.from("allocation_items").insert(childPayload);
  if (childErr) {
    await supabase.from("allocations").delete().eq("id", row.id);
    return NextResponse.json(
      { message: childErr.message ?? "라인 저장에 실패했습니다." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    id: row.id,
    orderDate: ymdFromDb(row.order_date),
    totalCost: row.total_cost,
    totalPallets: row.total_pallets,
    centerCount: row.center_count,
    memo: row.memo,
    createdAt: row.created_at,
  });
}

export async function GET(request: Request) {
  const supabase = await createAllocationsSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const start = normalizeYmd(searchParams.get("start"));
  const end = normalizeYmd(searchParams.get("end"));
  if (!start || !end) {
    return NextResponse.json(
      { message: "start, end 쿼리(YYYY-MM-DD)가 필요합니다." },
      { status: 400 }
    );
  }

  const { data: recordsRaw, error } = await supabase
    .from("allocations")
    .select("id, order_date, total_cost, total_pallets, center_count, memo, created_at")
    .gte("order_date", start)
    .lte("order_date", end)
    .order("order_date", { ascending: false });

  if (error) {
    return NextResponse.json({ message: error.message ?? "조회에 실패했습니다." }, { status: 500 });
  }

  const records = (recordsRaw ?? []) as unknown as AllocRow[];

  const summary = {
    count: records.length,
    totalCost: records.reduce((s, r) => s + r.total_cost, 0),
    totalPallets: records.reduce((s, r) => s + r.total_pallets, 0),
    avgCostPerRecord:
      records.length > 0
        ? Math.round(records.reduce((s, r) => s + r.total_cost, 0) / records.length)
        : 0,
  };

  const byDate = new Map<string, { cost: number; pallets: number }>();
  for (const r of records) {
    const d = ymdFromDb(r.order_date);
    const prev = byDate.get(d) ?? { cost: 0, pallets: 0 };
    byDate.set(d, {
      cost: prev.cost + r.total_cost,
      pallets: prev.pallets + r.total_pallets,
    });
  }
  const daily = [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, v]) => ({ date, cost: v.cost, pallets: v.pallets }));

  return NextResponse.json({
    summary,
    records: records.map((r) => ({
      id: r.id,
      orderDate: ymdFromDb(r.order_date),
      totalCost: r.total_cost,
      totalPallets: r.total_pallets,
      centerCount: r.center_count,
      memo: r.memo,
      createdAt: r.created_at,
    })),
    daily,
  });
}
