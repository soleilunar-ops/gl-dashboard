import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { composeOrderSource, type OrderCompanyCode } from "@/lib/orders/orderMeta";
import type { InsertTables } from "@/lib/supabase/types";

// 변경 이유: 구매현황 엑셀에서 파싱한 행을 일괄 erp_purchases에 넣습니다.

interface ImportRow {
  erpRef?: string;
  purchaseDateIso?: string;
  erpCode?: string;
  productName?: string;
  quantity?: number;
  unitPriceCny?: number;
  totalCny?: number;
  supplierName?: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseBody(raw: unknown): {
  rows: ImportRow[];
  companyCode: OrderCompanyCode | null;
  fileName: string | null;
} | null {
  if (raw === null || typeof raw !== "object") {
    return null;
  }
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.rows)) {
    return null;
  }
  const companyCode: OrderCompanyCode | null =
    o.companyCode === "gl" || o.companyCode === "glpharm" || o.companyCode === "hnb"
      ? o.companyCode
      : null;
  const fileName = typeof o.fileName === "string" && o.fileName.trim() ? o.fileName.trim() : null;
  const out: ImportRow[] = [];
  for (const item of o.rows) {
    if (item === null || typeof item !== "object") {
      continue;
    }
    const r = item as Record<string, unknown>;
    out.push({
      erpRef: typeof r.erpRef === "string" ? r.erpRef : undefined,
      purchaseDateIso: typeof r.purchaseDateIso === "string" ? r.purchaseDateIso : undefined,
      erpCode: typeof r.erpCode === "string" ? r.erpCode : undefined,
      productName: typeof r.productName === "string" ? r.productName : undefined,
      quantity: typeof r.quantity === "number" ? r.quantity : undefined,
      unitPriceCny: typeof r.unitPriceCny === "number" ? r.unitPriceCny : undefined,
      totalCny: typeof r.totalCny === "number" ? r.totalCny : undefined,
      supplierName: typeof r.supplierName === "string" ? r.supplierName : undefined,
    });
  }
  return { rows: out, companyCode, fileName };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const res: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    res.push(arr.slice(i, i + size));
  }
  return res;
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
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

  const parsedBody = parseBody(json);
  if (!parsedBody || parsedBody.rows.length === 0) {
    return NextResponse.json({ message: "rows 배열이 비어 있습니다." }, { status: 400 });
  }
  if (!parsedBody.companyCode) {
    return NextResponse.json({ message: "기업(companyCode) 정보가 필요합니다." }, { status: 400 });
  }
  const companyCode = parsedBody.companyCode;
  const rows = parsedBody.rows;
  const importFileName = parsedBody.fileName;

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const normalized: {
    erpRef: string;
    purchaseDateIso: string;
    erpCode: string;
    productName: string;
    quantity: number;
    unitPriceCny: number;
    totalCny: number;
    supplierName: string;
  }[] = [];

  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const erpRef = r.erpRef?.trim();
    const purchaseDateIso = r.purchaseDateIso?.trim();
    const erpCode = r.erpCode?.trim() ?? "";
    const productName = r.productName?.trim() ?? "";
    const supplierName = r.supplierName?.trim() ?? "";

    if (!erpRef || !purchaseDateIso || !/^\d{4}-\d{2}-\d{2}$/.test(purchaseDateIso)) {
      return NextResponse.json(
        { message: `${i + 1}번째 행: 전표번호 또는 날짜가 올바르지 않습니다.` },
        { status: 400 }
      );
    }
    if (!erpCode) {
      return NextResponse.json(
        { message: `${i + 1}번째 행: 품목코드가 비어 있습니다.` },
        { status: 400 }
      );
    }
    if (
      r.quantity === undefined ||
      r.quantity === null ||
      !Number.isInteger(r.quantity) ||
      r.quantity <= 0
    ) {
      return NextResponse.json(
        { message: `${i + 1}번째 행: 수량이 올바르지 않습니다.` },
        { status: 400 }
      );
    }
    if (
      r.unitPriceCny === undefined ||
      r.unitPriceCny === null ||
      !Number.isFinite(r.unitPriceCny) ||
      r.unitPriceCny < 0
    ) {
      return NextResponse.json(
        { message: `${i + 1}번째 행: 단가가 올바르지 않습니다.` },
        { status: 400 }
      );
    }
    if (
      r.totalCny === undefined ||
      r.totalCny === null ||
      !Number.isFinite(r.totalCny) ||
      r.totalCny < 0
    ) {
      return NextResponse.json(
        { message: `${i + 1}번째 행: 합계가 올바르지 않습니다.` },
        { status: 400 }
      );
    }
    const expected = round2(r.quantity * r.unitPriceCny);
    if (Math.abs(expected - r.totalCny) > 0.02) {
      return NextResponse.json(
        {
          message: `${i + 1}번째 행: 합계(${r.totalCny})가 수량×단가(${expected})와 맞지 않습니다.`,
        },
        { status: 400 }
      );
    }
    if (!supplierName) {
      return NextResponse.json(
        { message: `${i + 1}번째 행: 거래처명이 비어 있습니다.` },
        { status: 400 }
      );
    }

    normalized.push({
      erpRef,
      purchaseDateIso,
      erpCode,
      productName,
      quantity: r.quantity,
      unitPriceCny: round2(r.unitPriceCny),
      totalCny: round2(r.totalCny),
      supplierName,
    });
  }

  const uniqueRefs = [...new Set(normalized.map((r) => r.erpRef))];
  const existingRefs = new Set<string>();
  for (const part of chunk(uniqueRefs, 150)) {
    const { data, error } = await admin.from("erp_purchases").select("erp_ref").in("erp_ref", part);
    if (error) {
      return NextResponse.json(
        { message: "기존 전표 조회 실패", detail: error.message },
        { status: 500 }
      );
    }
    for (const row of (data ?? []) as { erp_ref: string | null }[]) {
      if (row.erp_ref) {
        existingRefs.add(row.erp_ref);
      }
    }
  }

  const toInsertRows = normalized.filter((r) => !existingRefs.has(r.erpRef));
  const skipped = normalized.length - toInsertRows.length;

  const codes = [...new Set(toInsertRows.map((r) => r.erpCode))];
  const productIdByCode: Record<string, string> = {};
  for (const part of chunk(codes, 150)) {
    const { data, error } = await admin
      .from("products")
      .select("id, erp_code")
      .in("erp_code", part);
    if (error) {
      return NextResponse.json(
        { message: "품목 매핑 조회 실패", detail: error.message },
        { status: 500 }
      );
    }
    for (const p of (data ?? []) as { id: string; erp_code: string | null }[]) {
      if (p.erp_code) {
        productIdByCode[p.erp_code] = p.id;
      }
    }
  }

  const inserts: InsertTables<"erp_purchases">[] = toInsertRows.map((r) => ({
    product_id: productIdByCode[r.erpCode] ?? null,
    erp_code: r.erpCode,
    erp_product_name: r.productName || null,
    supplier_name: r.supplierName,
    purchase_date: r.purchaseDateIso,
    erp_date: r.purchaseDateIso,
    quantity: r.quantity,
    unit_price: r.unitPriceCny,
    amount: r.totalCny,
    erp_ref: r.erpRef,
    source: composeOrderSource(companyCode, "excel_upload"),
  }));

  if (inserts.length > 0) {
    const { error: insertError } = await admin.from("erp_purchases").insert(inserts);
    if (insertError) {
      return NextResponse.json(
        { message: "erp_purchases 일괄 저장 실패", detail: insertError.message },
        { status: 500 }
      );
    }
  }

  if (importFileName) {
    const uploadLog = {
      company_code: companyCode,
      file_name: importFileName,
      total_input: normalized.length,
      inserted_count: inserts.length,
      skipped_count: skipped,
      created_at: new Date().toISOString(),
    };
    // 변경 이유: 업로드 파일 이력을 팝업에서 조회할 수 있도록 import 메타 정보를 별도 테이블에 남깁니다.
    const { error: logError } = await admin.from("order_excel_upload_logs").insert(uploadLog);
    if (logError) {
      return NextResponse.json(
        {
          message: "업로드 로그 저장 실패",
          detail: logError.message,
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    message: "가져오기 완료",
    inserted: inserts.length,
    skipped,
    totalInput: normalized.length,
  });
}
