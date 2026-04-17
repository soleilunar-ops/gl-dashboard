// src/app/api/orders/excel-upload-history/route.ts
// 엑셀 업로드 이력 조회 — 팝업 내 "최근 업로드" 목록
// 요청: GET ?companyCode=gl|gl_pharm|hnb

import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { OrderCompanyCode } from "@/lib/orders/orderMeta";
import type { Database } from "@/lib/supabase/types";

function resolveCompanyCode(value: string | null): OrderCompanyCode | null {
  if (value === "gl" || value === "gl_pharm" || value === "hnb") {
    return value;
  }
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
  const companyCode = resolveCompanyCode(url.searchParams.get("companyCode"));
  if (!companyCode) {
    return NextResponse.json({ error: "companyCode: gl | gl_pharm | hnb 필요" }, { status: 400 });
  }

  const admin = createAdmin<Database>(supabaseUrl, serviceRoleKey);

  const { data, error } = await admin
    .from("order_excel_upload_logs")
    .select("id, company_code, file_name, total_input, inserted_count, skipped_count, created_at")
    .eq("company_code", companyCode)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ logs: data ?? [] });
}
