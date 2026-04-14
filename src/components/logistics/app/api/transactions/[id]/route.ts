import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/db";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_: Request, { params }: Params) {
  const { id } = await params;
  const db = getDb();
  const row = db.prepare("SELECT * FROM transactions WHERE id = ?").get(Number(id));

  if (!row) {
    return NextResponse.json({ message: "내역을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json(row);
}

export async function DELETE(_: Request, { params }: Params) {
  const { id } = await params;
  const db = getDb();
  db.prepare("DELETE FROM transactions WHERE id = ?").run(Number(id));
  return NextResponse.json({ success: true });
}
