import { NextResponse } from "next/server";
import { getDb } from "../../../../../lib/db";
import { getErpLedgerByCode } from "../../../../../lib/erp-client";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const itemId = Number(id);
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from") ?? "20260401";
    const to = searchParams.get("to") ?? new Date().toISOString().slice(0, 10).replaceAll("-", "");
    const db = getDb();

    const item = db.prepare("SELECT erp_code FROM items WHERE id = ?").get(itemId) as
      | { erp_code: string | null }
      | undefined;

    if (!item || !item.erp_code) {
      return NextResponse.json({ message: "ERP 코드가 없는 품목입니다." }, { status: 404 });
    }

    const rows = await getErpLedgerByCode(item.erp_code, from, to);
    return NextResponse.json(rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ message }, { status: 500 });
  }
}
