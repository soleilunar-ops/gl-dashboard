// src/app/api/orders/bulk-import-purchase-excel/route.ts
// 엑셀 행들을 orders 테이블에 일괄 INSERT (status='pending', tx_type='purchase')
// - auth: 쿠키 세션 로그인 필수
// - admin client: service_role_key로 RLS 우회하여 배치 INSERT
// - 중복 체크: 같은 erp_system + tx_type='purchase' + erp_tx_no 기준 skip
// - item_id 매핑: item_erp_mapping(verified) erp_code → item_id 조회

import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { composeOrderSource, type OrderCompanyCode } from "@/lib/orders/orderMeta";
import type { Database, Tables, TablesInsert } from "@/lib/supabase/types";

type OrderInsert = TablesInsert<"orders">;

interface ImportRow {
  erpRef: string;
  purchaseDateIso: string;
  erpCode: string;
  productName?: string;
  quantity: number;
  unitPriceCny: number;
  totalCny: number;
  supplierName: string;
}

const VALID_COMPANY: readonly OrderCompanyCode[] = ["gl", "gl_pharm", "hnb"];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function parseBody(raw: unknown): {
  rows: Array<Record<string, unknown>>;
  companyCode: OrderCompanyCode | null;
  fileName: string | null;
} | null {
  if (raw === null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.rows)) return null;
  const companyCode: OrderCompanyCode | null =
    o.companyCode === "gl" || o.companyCode === "gl_pharm" || o.companyCode === "hnb"
      ? (o.companyCode as OrderCompanyCode)
      : null;
  const fileName = typeof o.fileName === "string" && o.fileName.trim() ? o.fileName.trim() : null;
  return {
    rows: o.rows as Array<Record<string, unknown>>,
    companyCode,
    fileName,
  };
}

function normalizeRow(
  item: Record<string, unknown>,
  i: number
): { row: ImportRow | null; error: string | null } {
  const erpRef = typeof item.erpRef === "string" ? item.erpRef.trim() : "";
  const dateIso = typeof item.purchaseDateIso === "string" ? item.purchaseDateIso.trim() : "";
  const erpCode = typeof item.erpCode === "string" ? item.erpCode.trim() : "";
  const supplierName = typeof item.supplierName === "string" ? item.supplierName.trim() : "";
  const quantity =
    typeof item.quantity === "number" && Number.isInteger(item.quantity) ? item.quantity : null;
  const unitPrice =
    typeof item.unitPriceCny === "number" && Number.isFinite(item.unitPriceCny)
      ? item.unitPriceCny
      : null;
  const total =
    typeof item.totalCny === "number" && Number.isFinite(item.totalCny) ? item.totalCny : null;

  if (!erpRef) return { row: null, error: `${i + 1}행: 전표번호 누락` };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso))
    return { row: null, error: `${i + 1}행: 날짜 형식 오류` };
  if (!erpCode) return { row: null, error: `${i + 1}행: 품목코드 누락` };
  if (quantity === null || quantity <= 0) return { row: null, error: `${i + 1}행: 수량 오류` };
  if (unitPrice === null || unitPrice < 0) return { row: null, error: `${i + 1}행: 단가 오류` };
  if (total === null || total < 0) return { row: null, error: `${i + 1}행: 합계 오류` };

  const expected = round2(quantity * unitPrice);
  if (Math.abs(expected - total) > 0.02) {
    return {
      row: null,
      error: `${i + 1}행: 합계(${total}) ≠ 수량×단가(${expected})`,
    };
  }
  if (!supplierName) return { row: null, error: `${i + 1}행: 거래처 누락` };

  return {
    row: {
      erpRef,
      purchaseDateIso: dateIso,
      erpCode,
      productName:
        typeof item.productName === "string" ? item.productName.trim() || undefined : undefined,
      quantity,
      unitPriceCny: round2(unitPrice),
      totalCny: round2(total),
      supplierName,
    },
    error: null,
  };
}

export async function POST(request: Request) {
  // 1. 인증
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  // 2. env
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Supabase 서버 환경변수가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  // 3. body 파싱
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON 파싱 실패" }, { status: 400 });
  }
  const parsed = parseBody(raw);
  if (!parsed || parsed.rows.length === 0) {
    return NextResponse.json({ error: "rows 배열이 비어 있습니다." }, { status: 400 });
  }
  if (!parsed.companyCode) {
    return NextResponse.json({ error: "companyCode: gl | gl_pharm | hnb 필요" }, { status: 400 });
  }
  if (!VALID_COMPANY.includes(parsed.companyCode)) {
    return NextResponse.json({ error: "알 수 없는 companyCode" }, { status: 400 });
  }
  const companyCode = parsed.companyCode;

  // 4. 행 정규화 + 검증
  const normalized: ImportRow[] = [];
  for (let i = 0; i < parsed.rows.length; i += 1) {
    const { row, error: rowErr } = normalizeRow(parsed.rows[i], i);
    if (rowErr) {
      return NextResponse.json({ error: rowErr }, { status: 400 });
    }
    if (row) normalized.push(row);
  }

  const admin = createAdmin<Database>(supabaseUrl, serviceRoleKey);

  // 5. 중복 체크 — 같은 erp_system + tx_type + erp_tx_no 기준
  const refs = [...new Set(normalized.map((r) => r.erpRef))];
  const existing = new Set<string>();
  for (const batch of chunk(refs, 150)) {
    const { data, error: err } = await admin
      .from("orders")
      .select("erp_tx_no")
      .eq("erp_system", companyCode)
      .eq("tx_type", "purchase")
      .in("erp_tx_no", batch);
    if (err) {
      return NextResponse.json({ error: `중복 체크 실패: ${err.message}` }, { status: 500 });
    }
    type TxNoRow = Pick<Tables<"orders">, "erp_tx_no">;
    for (const row of (data ?? []) as TxNoRow[]) {
      if (row.erp_tx_no) existing.add(row.erp_tx_no);
    }
  }
  const toInsert = normalized.filter((r) => !existing.has(r.erpRef));
  const skipped = normalized.length - toInsert.length;

  // 6. item_id 매핑 — item_erp_mapping.erp_code → item_id (verified만)
  const codes = [...new Set(toInsert.map((r) => r.erpCode))];
  const itemByCode = new Map<string, number>();
  for (const batch of chunk(codes, 150)) {
    const { data, error: err } = await admin
      .from("item_erp_mapping")
      .select("item_id, erp_code")
      .eq("erp_system", companyCode)
      .eq("mapping_status", "verified")
      .in("erp_code", batch);
    if (err) {
      return NextResponse.json({ error: `품목 매핑 조회 실패: ${err.message}` }, { status: 500 });
    }
    type MappingPick = Pick<Tables<"item_erp_mapping">, "item_id" | "erp_code">;
    for (const m of (data ?? []) as MappingPick[]) {
      if (m.erp_code) itemByCode.set(m.erp_code, m.item_id);
    }
  }

  // 7. INSERT 레코드 생성 (같은 erp_tx_no 내 line_no 연속 부여)
  const lineNoByRef = new Map<string, number>();
  const unmapped: string[] = [];
  const inserts: OrderInsert[] = [];
  for (const r of toInsert) {
    const itemId = itemByCode.get(r.erpCode);
    if (itemId === undefined) {
      unmapped.push(r.erpRef);
      continue;
    }
    const lineNo = (lineNoByRef.get(r.erpRef) ?? 0) + 1;
    lineNoByRef.set(r.erpRef, lineNo);
    inserts.push({
      tx_date: r.purchaseDateIso,
      item_id: itemId,
      erp_system: companyCode,
      tx_type: "purchase",
      erp_code: r.erpCode,
      erp_tx_no: r.erpRef,
      erp_tx_line_no: lineNo,
      erp_item_name_raw: r.productName ?? null,
      counterparty: r.supplierName,
      quantity: r.quantity,
      unit_price: r.unitPriceCny,
      total_amount: r.totalCny,
      memo: composeOrderSource(companyCode, "excel_upload"),
      status: "pending",
    });
  }
  const unmappedCount = unmapped.length;

  if (inserts.length > 0) {
    const { error: insertErr } = await admin.from("orders").insert(inserts);
    if (insertErr) {
      return NextResponse.json(
        { error: `orders 저장 실패: ${insertErr.message}` },
        { status: 500 }
      );
    }
  }

  // 8. 업로드 이력 기록
  if (parsed.fileName) {
    const { error: logErr } = await admin.from("order_excel_upload_logs").insert({
      company_code: companyCode,
      file_name: parsed.fileName,
      total_input: normalized.length,
      inserted_count: inserts.length,
      skipped_count: skipped + unmappedCount,
    });
    if (logErr) {
      return NextResponse.json({ error: `이력 저장 실패: ${logErr.message}` }, { status: 500 });
    }
  }

  return NextResponse.json({
    message: "가져오기 완료",
    totalInput: normalized.length,
    inserted: inserts.length,
    skipped,
    unmapped: unmappedCount,
    unmappedRefs: unmapped,
  });
}
