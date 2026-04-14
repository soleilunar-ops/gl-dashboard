import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/db";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_: Request, { params }: Params) {
  const { id } = await params;
  const itemId = Number(id);
  const db = getDb();
  const row = db.prepare("SELECT * FROM items WHERE id = ?").get(itemId);

  if (!row) {
    return NextResponse.json({ message: "품목을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json(row);
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const itemId = Number(id);
  const body = (await request.json()) as {
    item_name?: string;
    category?: string;
    is_active?: number;
  };
  const db = getDb();

  db.prepare(
    "UPDATE items SET item_name = COALESCE(?, item_name), category = COALESCE(?, category), is_active = COALESCE(?, is_active) WHERE id = ?"
  ).run(body.item_name ?? null, body.category ?? null, body.is_active ?? null, itemId);

  return NextResponse.json({ success: true });
}
