// 파일 선택 직후 원본을 Storage에 올리고 order_excel_upload_logs 행을 만듦 — 변경 이유: 업로드 전에도 이력·재다운로드 가능하게 함
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import type { OrderCompanyCode } from "@/lib/orders/orderMeta";
import type { Database } from "@/lib/supabase/types";
import { ORDER_EXCEL_STORAGE_BUCKET } from "@/lib/orders/excelUploadStorage";

const VALID_COMPANY: readonly OrderCompanyCode[] = ["gl", "glpharm", "hnb"];

/** Storage 객체 키용 파일명 정규화 — 변경 이유: Supabase Storage가 비-ASCII 키 거부(예: 한글 파일명) → 영숫자/점/대시/언더바만 허용. 원본 파일명은 excel_uploads.file_name에 한글 그대로 보존 */
function safeStorageSegment(name: string): string {
  const t = name.trim() || "upload.xlsx";
  const cleaned = t.replace(/[^\w.\-]/g, "_").slice(0, 140);
  return cleaned || "upload.xlsx";
}

function resolveCompany(value: unknown): OrderCompanyCode | null {
  if (value === "gl" || value === "glpharm" || value === "hnb") return value;
  return null;
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
    return NextResponse.json({ error: "서버 설정 오류" }, { status: 500 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "multipart 파싱 실패" }, { status: 400 });
  }

  const companyCode = resolveCompany(form.get("companyCode"));
  const fileField = form.get("file");
  if (!companyCode || !VALID_COMPANY.includes(companyCode)) {
    return NextResponse.json({ error: "companyCode: gl | gl_pharm | hnb 필요" }, { status: 400 });
  }
  if (!(fileField instanceof File) || fileField.size <= 0) {
    return NextResponse.json({ error: "파일이 필요합니다." }, { status: 400 });
  }

  const displayFileName = fileField.name.trim() || "upload.xlsx";
  const ab = await fileField.arrayBuffer();
  const fileBytes = new Uint8Array(ab);

  const segment = safeStorageSegment(displayFileName);
  const path = `${user.id}/${randomUUID()}_${segment}`;
  const lower = segment.toLowerCase();
  const mime =
    lower.endsWith(".xls") && !lower.endsWith(".xlsx")
      ? "application/vnd.ms-excel"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  const admin = createAdmin<Database>(supabaseUrl, serviceRoleKey);

  const { error: upErr } = await admin.storage
    .from(ORDER_EXCEL_STORAGE_BUCKET)
    .upload(path, fileBytes, {
      contentType: mime,
      upsert: false,
    });
  if (upErr) {
    return NextResponse.json({ error: `Storage 업로드 실패: ${upErr.message}` }, { status: 500 });
  }

  const { data: inserted, error: logErr } = await admin
    .from("excel_uploads")
    .insert({
      // 변경 이유: excel_uploads.category CHECK 제약에 'order_purchase_excel' 없음 → 'other'로 통과시키고 notes로 실제 카테고리 보존
      category: "other",
      notes: "order_purchase_excel",
      company_code: companyCode,
      file_name: displayFileName,
      total_rows: 0,
      inserted_rows: 0,
      skipped_rows: 0,
      storage_path: path,
      uploaded_by: user.id,
    })
    .select("id")
    .single();

  if (logErr || !inserted?.id) {
    return NextResponse.json(
      { error: `이력 저장 실패: ${logErr?.message ?? "unknown"}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ logId: inserted.id });
}
