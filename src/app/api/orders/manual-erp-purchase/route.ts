// src/app/api/orders/manual-erp-purchase/route.ts
// 수동 1건 입력 → orders 테이블에 INSERT (status='pending', tx_type='purchase')
// - 인증 필수, admin client로 RLS 우회
// - erp_tx_no 충돌 회피: MANUAL-<randomUUID> 생성 (line_no=1)

import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { composeOrderSource, type OrderCompanyCode } from "@/lib/orders/orderMeta";
import type { Database, TablesInsert } from "@/lib/supabase/types";

interface Body {
  companyCode?: OrderCompanyCode;
  itemId?: number;
  erpCode?: string;
  purchaseDate?: string; // YYYY-MM-DD
  quantity?: number;
  unitPrice?: number;
  grossTotal?: number;
  supplyAmount?: number;
  vatAmount?: number;
  currency?: string;
  /** 1 외화 단위당 KRW(수동 입력·조회값) */
  exchangeRateToKrw?: number;
  supplierName?: string;
  productName?: string;
  memo?: string;
}

const VALID_COMPANY: readonly OrderCompanyCode[] = ["gl", "gl_pharm", "hnb"];
const VALID_CURRENCY = new Set(["CNY", "USD", "KRW"]);

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

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON 파싱 실패" }, { status: 400 });
  }

  if (!body.companyCode || !VALID_COMPANY.includes(body.companyCode)) {
    return NextResponse.json({ error: "companyCode: gl | gl_pharm | hnb 필요" }, { status: 400 });
  }
  if (!Number.isInteger(body.itemId) || (body.itemId ?? 0) <= 0) {
    return NextResponse.json({ error: "itemId(양의 정수) 필요" }, { status: 400 });
  }
  if (!body.purchaseDate || !/^\d{4}-\d{2}-\d{2}$/.test(body.purchaseDate)) {
    return NextResponse.json({ error: "purchaseDate(YYYY-MM-DD) 필요" }, { status: 400 });
  }
  if (!Number.isInteger(body.quantity) || (body.quantity ?? 0) <= 0) {
    return NextResponse.json({ error: "quantity(양의 정수) 필요" }, { status: 400 });
  }
  if (typeof body.unitPrice !== "number" || body.unitPrice < 0) {
    return NextResponse.json({ error: "unitPrice(≥0) 필요" }, { status: 400 });
  }
  if (typeof body.grossTotal !== "number" || body.grossTotal < 0) {
    return NextResponse.json({ error: "grossTotal(≥0) 필요" }, { status: 400 });
  }
  if (
    body.supplyAmount !== undefined &&
    body.supplyAmount !== null &&
    (typeof body.supplyAmount !== "number" || body.supplyAmount < 0)
  ) {
    return NextResponse.json({ error: "supplyAmount(≥0) 불일치" }, { status: 400 });
  }
  if (
    body.vatAmount !== undefined &&
    body.vatAmount !== null &&
    (typeof body.vatAmount !== "number" || body.vatAmount < 0)
  ) {
    return NextResponse.json({ error: "vatAmount(≥0) 불일치" }, { status: 400 });
  }
  if (
    body.currency !== undefined &&
    body.currency !== null &&
    body.currency !== "" &&
    !VALID_CURRENCY.has(body.currency)
  ) {
    return NextResponse.json({ error: "currency: CNY | USD | KRW" }, { status: 400 });
  }
  if (!body.supplierName || !body.supplierName.trim()) {
    return NextResponse.json({ error: "거래처명(supplierName) 필요" }, { status: 400 });
  }

  const currency = body.currency && VALID_CURRENCY.has(body.currency) ? body.currency : "CNY";
  if (
    currency !== "KRW" &&
    (body.exchangeRateToKrw === undefined ||
      body.exchangeRateToKrw === null ||
      typeof body.exchangeRateToKrw !== "number" ||
      body.exchangeRateToKrw <= 0 ||
      !Number.isFinite(body.exchangeRateToKrw))
  ) {
    return NextResponse.json(
      { error: "KRW가 아닌 통화는 exchangeRateToKrw(양의 유한수) 필요" },
      { status: 400 }
    );
  }

  const admin = createAdmin<Database>(supabaseUrl, serviceRoleKey);

  const erpTxNo = `MANUAL-${globalThis.crypto.randomUUID()}`;
  const baseMemo = composeOrderSource(body.companyCode, "dashboard_manual");
  const memoWithCurrency =
    currency === "KRW"
      ? `${baseMemo} · 통화:${currency}`
      : `${baseMemo} · 통화:${currency} · 환율:1${currency}=${(body.exchangeRateToKrw as number).toLocaleString("ko-KR", { maximumFractionDigits: 6 })}KRW`;

  const payload: TablesInsert<"orders"> = {
    tx_date: body.purchaseDate,
    item_id: body.itemId!,
    erp_system: body.companyCode,
    tx_type: "purchase",
    erp_code: body.erpCode?.trim() ?? null,
    erp_tx_no: erpTxNo,
    erp_tx_line_no: 1,
    erp_item_name_raw: body.productName?.trim() ?? null,
    counterparty: body.supplierName.trim(),
    quantity: body.quantity!,
    unit_price: body.unitPrice,
    supply_amount: body.supplyAmount ?? null,
    vat: body.vatAmount ?? null,
    total_amount: body.grossTotal,
    memo: body.memo?.trim() ? `${memoWithCurrency} · ${body.memo.trim()}` : memoWithCurrency,
    status: "pending",
  };

  const { data, error } = await admin.from("orders").insert(payload).select("id").single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: "저장 완료", orderId: data?.id });
}
