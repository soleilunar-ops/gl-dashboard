import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { OrderCompanyCode } from "@/lib/orders/orderMeta";

interface UploadHistoryRow {
  company_code: OrderCompanyCode;
  file_name: string;
  total_input: number;
  inserted_count: number;
  skipped_count: number;
  created_at: string;
}

function resolveCompanyCode(value: string | null): OrderCompanyCode | null {
  if (value === "gl" || value === "glpharm" || value === "hnb") {
    return value;
  }
  return null;
}

export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { message: "Supabase 서버 환경변수가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  const companyCode = resolveCompanyCode(new URL(request.url).searchParams.get("companyCode"));
  if (companyCode === null) {
    return NextResponse.json({ records: [] });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await admin
    .from("order_excel_upload_logs")
    .select("company_code, file_name, total_input, inserted_count, skipped_count, created_at")
    .eq("company_code", companyCode)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) {
    return NextResponse.json(
      {
        message: "엑셀 업로드 이력 조회 실패",
        detail: error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ records: (data ?? []) as UploadHistoryRow[] });
}
