// src/app/api/orders/excel-upload-history/route.ts
// 엑셀 업로드 이력 조회 — 팝업 내 "최근 업로드" 목록
// 요청: GET ?companyCode=gl|gl_pharm|hnb  |  ?scope=all (전 기업 이력)

import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { normalizeOrderCompanyCode, type OrderCompanyCode } from "@/lib/orders/orderMeta";
import type { Database } from "@/lib/supabase/types";

/** 변경 이유: 사용자 친화 입력값 'gl_pharm'도 받아 정규화 후 DB enum 'glpharm'으로 통일 */
function resolveCompanyCode(value: string | null): OrderCompanyCode | null {
  if (value === "gl" || value === "glpharm" || value === "hnb") return value;
  if (value === "gl_pharm") return normalizeOrderCompanyCode("gl_pharm");
  return null;
}

export async function GET(request: Request) {
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

  const url = new URL(request.url);
  const scopeAll = url.searchParams.get("scope") === "all";
  const companyCode = resolveCompanyCode(url.searchParams.get("companyCode"));

  if (!scopeAll && !companyCode) {
    return NextResponse.json(
      { error: "companyCode: gl | gl_pharm | hnb 필요, 또는 scope=all" },
      { status: 400 }
    );
  }

  const admin = createAdmin<Database>(supabaseUrl, serviceRoleKey);

  let q = admin
    .from("excel_uploads")
    .select(
      "id, company_code, file_name, total_rows, inserted_rows, skipped_rows, uploaded_at, storage_path, uploaded_by"
    )
    // 변경 이유: category enum에 'order_purchase_excel' 없어 'other'+notes 보존 패턴으로 분리됨
    .eq("category", "other")
    .eq("notes", "order_purchase_excel")
    .order("uploaded_at", { ascending: false });

  if (!scopeAll && companyCode) {
    q = q.eq("company_code", companyCode);
  }
  const { data, error } = await q.limit(scopeAll ? 100 : 40);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ logs: data ?? [] });
}
