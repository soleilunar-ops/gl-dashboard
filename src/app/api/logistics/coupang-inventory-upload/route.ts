// 쿠팡 판매자센터 로켓 일별 재고 CSV → inventory_operation + sku_master upsert
// - 인증된 사용자만 허용
// - service_role로 RLS 우회 (bulk-import 패턴과 동일)

import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import {
  decodeCoupangInventoryFileBytes,
  parseCoupangRocketInventoryCsv,
  type ParsedRocketInventoryRow,
} from "@/lib/logistics/parseCoupangRocketInventoryCsv";
import type { Database, TablesInsert } from "@/lib/supabase/types";
import { NextResponse } from "next/server";

type SkuInsert = TablesInsert<"sku_master">;
type InvInsert = TablesInsert<"inventory_operation">;

const MAX_FILE_BYTES = 12 * 1024 * 1024;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function dedupeByOpSkuCenter(rows: ParsedRocketInventoryRow[]): ParsedRocketInventoryRow[] {
  const map = new Map<string, ParsedRocketInventoryRow>();
  for (const r of rows) {
    const k = `${r.op_date}\t${r.sku_id}\t${r.center}`;
    map.set(k, r);
  }
  return [...map.values()];
}

function buildSkuUpserts(rows: ParsedRocketInventoryRow[]): SkuInsert[] {
  const bySku = new Map<string, SkuInsert>();
  for (const r of rows) {
    if (!bySku.has(r.sku_id)) {
      bySku.set(r.sku_id, {
        sku_id: r.sku_id,
        sku_name: r.sku_name.slice(0, 2000),
        brand: r.brand,
        product_category: r.product_category,
        sub_category: r.sub_category,
        detail_category: r.detail_category,
        barcode: r.barcode,
        updated_at: new Date().toISOString(),
      });
    }
  }
  return [...bySku.values()];
}

function toInventoryInserts(rows: ParsedRocketInventoryRow[]): InvInsert[] {
  return rows.map((r) => ({
    op_date: r.op_date,
    sku_id: r.sku_id,
    center: r.center,
    order_status: r.order_status,
    order_status_detail: r.order_status_detail,
    inbound_qty: r.inbound_qty,
    outbound_qty: r.outbound_qty,
    current_stock: r.current_stock,
    purchase_cost: r.purchase_cost,
    order_fulfillment_rate: r.order_fulfillment_rate,
    confirmed_fulfillment_rate: r.confirmed_fulfillment_rate,
    return_rate: r.return_rate,
    return_reason: r.return_reason,
    is_stockout: r.is_stockout,
    category_stockout_rate: r.category_stockout_rate,
  }));
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
      { error: "Supabase 서버 환경변수(SUPABASE_SERVICE_ROLE_KEY)가 없습니다." },
      { status: 500 }
    );
  }

  let fileText: string;
  let fileName: string | null = null;
  const ct = request.headers.get("content-type") ?? "";

  if (ct.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "file 필드에 CSV 파일이 필요합니다." }, { status: 400 });
    }
    fileName = file.name || null;
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "파일 크기는 12MB 이하여야 합니다." }, { status: 400 });
    }
    const raw = new Uint8Array(await file.arrayBuffer());
    fileText = decodeCoupangInventoryFileBytes(raw);
  } else if (ct.includes("application/json")) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "JSON 파싱 실패" }, { status: 400 });
    }
    if (body === null || typeof body !== "object" || !("csvText" in body)) {
      return NextResponse.json({ error: "JSON에는 csvText 문자열이 필요합니다." }, { status: 400 });
    }
    const csvText = (body as { csvText?: unknown }).csvText;
    if (typeof csvText !== "string" || !csvText.trim()) {
      return NextResponse.json({ error: "csvText가 비어 있습니다." }, { status: 400 });
    }
    fileText = csvText;
  } else {
    return NextResponse.json(
      { error: "Content-Type은 multipart/form-data 또는 application/json 이어야 합니다." },
      { status: 415 }
    );
  }

  const {
    rows: rawRows,
    errors: parseWarnings,
    skippedEmptySku,
  } = parseCoupangRocketInventoryCsv(fileText);
  if (rawRows.length === 0) {
    return NextResponse.json(
      {
        error: "유효한 행이 없습니다.",
        parseWarnings,
        skippedEmptySku,
      },
      { status: 400 }
    );
  }

  const rows = dedupeByOpSkuCenter(rawRows);
  const admin = createAdmin<Database>(supabaseUrl, serviceRoleKey);

  const skuRows = buildSkuUpserts(rows);
  for (const batch of chunk(skuRows, 200)) {
    const { error: skuErr } = await admin
      .from("sku_master")
      .upsert(batch, { onConflict: "sku_id" });
    if (skuErr) {
      return NextResponse.json(
        { error: `sku_master 반영 실패: ${skuErr.message}`, parseWarnings, skippedEmptySku },
        { status: 500 }
      );
    }
  }

  let upserted = 0;
  const invBatches = chunk(toInventoryInserts(rows), 250);
  for (const batch of invBatches) {
    const { error: invErr } = await admin.from("inventory_operation").upsert(batch, {
      onConflict: "op_date,sku_id,center",
    });
    if (invErr) {
      return NextResponse.json(
        {
          error: `inventory_operation 반영 실패: ${invErr.message}`,
          parseWarnings,
          skippedEmptySku,
        },
        { status: 500 }
      );
    }
    upserted += batch.length;
  }

  const opDates = [...new Set(rows.map((r) => r.op_date))].sort();

  return NextResponse.json({
    ok: true,
    fileName,
    upserted,
    skuMasterTouched: skuRows.length,
    inputRows: rawRows.length,
    uniqueRows: rows.length,
    skippedEmptySku,
    op_dates: opDates,
    parseWarnings,
  });
}
