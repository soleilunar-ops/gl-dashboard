import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { ORDER_EXCEL_STORAGE_BUCKET } from "@/lib/orders/excelUploadStorage";

/** 직접 업로드해 Storage에 보관된 엑셀 원본 다운로드 — 변경 이유: 이력에서 파일 재저장 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const logIdStr = new URL(request.url).searchParams.get("logId");
  const logId = logIdStr ? Number(logIdStr) : null;
  if (!logId || !Number.isFinite(logId)) {
    return NextResponse.json({ error: "logId 필요 (숫자)" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "서버 설정 오류" }, { status: 500 });
  }

  const admin = createAdmin<Database>(supabaseUrl, serviceRoleKey);

  const { data: log, error: qErr } = await admin
    .from("excel_uploads")
    .select("storage_path, file_name, uploaded_by")
    .eq("id", logId)
    .maybeSingle();

  if (qErr || !log) {
    return NextResponse.json({ error: "이력을 찾을 수 없습니다." }, { status: 404 });
  }

  if (!log.storage_path) {
    return NextResponse.json({ error: "저장된 파일이 없습니다. (이전 업로드)" }, { status: 404 });
  }

  if (log.uploaded_by !== null && log.uploaded_by !== user.id) {
    return NextResponse.json({ error: "다운로드 권한이 없습니다." }, { status: 403 });
  }

  const { data: blob, error: dlErr } = await admin.storage
    .from(ORDER_EXCEL_STORAGE_BUCKET)
    .download(log.storage_path);

  if (dlErr || !blob) {
    return NextResponse.json({ error: dlErr?.message ?? "파일 읽기 실패" }, { status: 500 });
  }

  const buf = await blob.arrayBuffer();
  const asciiName = log.file_name.replace(/[^\x20-\x7E]/g, "_") || "download.xlsx";

  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(log.file_name)}`,
    },
  });
}
