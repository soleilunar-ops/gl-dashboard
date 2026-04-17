import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { composeOrderSource, type OrderCompanyCode } from "@/lib/orders/orderMeta";
import type { InsertTables } from "@/lib/supabase/types";

// 변경 이유: 대시보드에서 수동 입력한 구매 계약을 서비스 롤로 안전하게 erp_purchases에 적재합니다.

interface ManualPurchaseBody {
  companyCode?: OrderCompanyCode;
  currencyCode?: "CNY" | "USD" | "KRW";
  productId?: string;
  purchaseDate?: string;
  quantity?: number;
  unitPrice?: number;
  grossTotal?: number;
  supplierName?: string;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseBody(raw: unknown): ManualPurchaseBody | null {
  if (raw === null || typeof raw !== "object") {
    return null;
  }
  const o = raw as Record<string, unknown>;
  return {
    companyCode:
      o.companyCode === "gl" || o.companyCode === "glpharm" || o.companyCode === "hnb"
        ? o.companyCode
        : undefined,
    currencyCode:
      o.currencyCode === "CNY" || o.currencyCode === "USD" || o.currencyCode === "KRW"
        ? o.currencyCode
        : undefined,
    productId: typeof o.productId === "string" ? o.productId : undefined,
    purchaseDate: typeof o.purchaseDate === "string" ? o.purchaseDate : undefined,
    quantity: typeof o.quantity === "number" ? o.quantity : undefined,
    unitPrice: typeof o.unitPrice === "number" ? o.unitPrice : undefined,
    grossTotal: typeof o.grossTotal === "number" ? o.grossTotal : undefined,
    supplierName: typeof o.supplierName === "string" ? o.supplierName : undefined,
  };
}

/** 서버에서도 한국 영업일 기준으로 미래 일자를 막기 위해 Asia/Seoul 날짜를 사용합니다. */
function todaySeoulDateString(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  if (!y || !m || !d) {
    return new Date().toISOString().slice(0, 10);
  }
  return `${y}-${m}-${d}`;
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

  const body = parseBody(json);
  if (!body) {
    return NextResponse.json({ message: "요청 본문 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const {
    companyCode,
    currencyCode,
    productId,
    purchaseDate,
    quantity,
    unitPrice,
    grossTotal,
    supplierName,
  } = body;

  if (!productId?.trim()) {
    return NextResponse.json({ message: "품목을 선택하세요." }, { status: 400 });
  }
  if (!purchaseDate || !isIsoDate(purchaseDate)) {
    return NextResponse.json({ message: "구매일자(YYYY-MM-DD)가 필요합니다." }, { status: 400 });
  }
  if (purchaseDate > todaySeoulDateString()) {
    return NextResponse.json({ message: "구매일자는 오늘 이후일 수 없습니다." }, { status: 400 });
  }
  if (
    quantity === undefined ||
    quantity === null ||
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    !Number.isInteger(quantity)
  ) {
    return NextResponse.json({ message: "수량은 1 이상의 정수여야 합니다." }, { status: 400 });
  }
  if (
    unitPrice === undefined ||
    unitPrice === null ||
    !Number.isFinite(unitPrice) ||
    unitPrice < 0
  ) {
    return NextResponse.json({ message: "단가(CNY)는 0 이상의 숫자여야 합니다." }, { status: 400 });
  }
  if (
    grossTotal === undefined ||
    grossTotal === null ||
    !Number.isFinite(grossTotal) ||
    grossTotal < 0
  ) {
    return NextResponse.json({ message: "합계 금액이 올바르지 않습니다." }, { status: 400 });
  }
  const expectedGross = Math.round(quantity * unitPrice * 100) / 100;
  if (Math.abs(expectedGross - grossTotal) > 0.01) {
    return NextResponse.json({ message: "합계가 수량·단가와 일치하지 않습니다." }, { status: 400 });
  }
  if (!supplierName?.trim()) {
    return NextResponse.json({ message: "거래처를 선택하세요." }, { status: 400 });
  }
  if (!companyCode) {
    return NextResponse.json({ message: "기업을 선택하세요." }, { status: 400 });
  }
  if (!currencyCode) {
    return NextResponse.json({ message: "통화를 선택하세요." }, { status: 400 });
  }

  // 변경 이유: 수동 Database 타입에 Relationships가 없어 제네릭 클라이언트는 insert/select가 never로 추론되므로 비제네릭 클라이언트를 씁니다.
  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: productRow, error: productError } = await admin
    .from("products")
    .select("id, erp_code, name")
    .eq("id", productId)
    .maybeSingle();

  if (productError) {
    return NextResponse.json(
      { message: "품목 조회 실패", detail: productError.message },
      { status: 500 }
    );
  }

  const product = productRow as {
    id: string;
    erp_code: string | null;
    name: string;
  } | null;

  if (!product) {
    return NextResponse.json({ message: "선택한 품목을 찾을 수 없습니다." }, { status: 400 });
  }

  const [y, m, d] = purchaseDate.split("-");
  const erpRef = `${y}/${m}/${d}-M-${Date.now().toString(36).toUpperCase()}`;

  const insertRow: InsertTables<"erp_purchases"> = {
    product_id: product.id,
    erp_code: product.erp_code,
    erp_product_name: product.name,
    supplier_name: supplierName.trim(),
    purchase_date: purchaseDate,
    erp_date: purchaseDate,
    quantity,
    unit_price: Math.round(unitPrice * 100) / 100,
    amount: grossTotal,
    erp_ref: erpRef,
    // 변경 이유: 주문 기업/통화를 source 규칙에 포함해 테이블 추가 컬럼 없이 필터링을 지원합니다.
    source: `${composeOrderSource(companyCode, "dashboard_manual")}:${currencyCode}`,
  };

  const { error: insertError } = await admin.from("erp_purchases").insert(insertRow);

  if (insertError) {
    return NextResponse.json(
      { message: "erp_purchases 저장 실패", detail: insertError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: "계약건이 추가되었습니다.", erpRef });
}
