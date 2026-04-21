import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Database } from "@/lib/supabase/types";
import { normalizeOrderCompanyCode, type OrderCompanyCodeInput } from "@/lib/orders/orderMeta";
import {
  ALL_ORDER_COMPANY_CODES,
  fetchEcountExcelDashboardRows,
} from "@/lib/orders/ecountExcelSource";

const ALLOWED = new Set<OrderCompanyCodeInput>(["gl", "glpharm", "gl_pharm", "hnb"]);

/** YYYY-MM-DD 검증 — 변경 이유: 원천 조회 기간 파라미터를 안전하게 수용 */
function normalizeIsoDate(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return undefined;
  return t;
}

/** 로그인 사용자만, service_role로 엑셀 원천 조회 — 변경 이유: RLS로 anon 클라이언트는 0건 반환될 수 있음 */
export async function POST(req: Request) {
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const raw = body as Record<string, unknown>;
  const rawCodes = Array.isArray(raw.companyCodes)
    ? raw.companyCodes.filter((c): c is string => typeof c === "string")
    : [];
  const companyCodes = rawCodes
    .filter((c): c is OrderCompanyCodeInput => ALLOWED.has(c as OrderCompanyCodeInput))
    .map((c) => normalizeOrderCompanyCode(c));
  const dateFrom = normalizeIsoDate(raw.dateFrom);
  const dateTo = normalizeIsoDate(raw.dateTo);

  const admin = createAdmin<Database>(supabaseUrl, serviceRoleKey);
  const rows = await fetchEcountExcelDashboardRows(
    admin,
    companyCodes.length > 0 ? companyCodes : [...ALL_ORDER_COMPANY_CODES],
    { dateFrom, dateTo }
  );

  return NextResponse.json({ rows });
}
