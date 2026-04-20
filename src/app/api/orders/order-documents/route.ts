import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { ORDER_DOCUMENT_STORAGE_BUCKET } from "@/lib/orders/orderDocumentStorage";

/** 파일명 Storage 세그먼트 정규화 — 변경 이유: 경로 인젝션·특수문자 완화 */
function safeStorageSegment(name: string): string {
  const t = name.trim() || "file.bin";
  return t.replace(/[^\w.\s\-가-힣()]/g, "_").slice(0, 140);
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const orderIdRaw = request.nextUrl.searchParams.get("orderId");
  const orderId = orderIdRaw ? Number(orderIdRaw) : NaN;
  if (!Number.isFinite(orderId) || orderId <= 0) {
    return NextResponse.json({ error: "orderId가 필요합니다." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "서버 설정 오류" }, { status: 500 });
  }

  const admin = createAdmin<Database>(supabaseUrl, serviceRoleKey);

  const { data: rows, error } = await admin
    .from("order_documents")
    .select("id, order_id, file_name, storage_path, created_at")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = rows ?? [];
  const withUrls = await Promise.all(
    list.map(async (row) => {
      const { data: signed, error: signErr } = await admin.storage
        .from(ORDER_DOCUMENT_STORAGE_BUCKET)
        .createSignedUrl(row.storage_path, 3600);
      return {
        id: row.id,
        file_name: row.file_name,
        created_at: row.created_at,
        signed_url: signErr ? null : (signed?.signedUrl ?? null),
      };
    })
  );

  return NextResponse.json({ documents: withUrls });
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

  const orderIdRaw = form.get("orderId");
  const orderId = typeof orderIdRaw === "string" ? Number(orderIdRaw) : NaN;
  if (!Number.isFinite(orderId) || orderId <= 0) {
    return NextResponse.json({ error: "유효한 orderId가 필요합니다." }, { status: 400 });
  }

  const admin = createAdmin<Database>(supabaseUrl, serviceRoleKey);

  const { data: orderRow, error: orderErr } = await admin
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr || !orderRow) {
    return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  }

  const fileEntries = form.getAll("files");
  const files = fileEntries.filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return NextResponse.json({ error: "저장할 파일이 없습니다." }, { status: 400 });
  }

  const inserted: { id: string; file_name: string }[] = [];

  for (const file of files) {
    const displayName = file.name.trim() || "첨부파일";
    const segment = safeStorageSegment(displayName);
    const path = `${user.id}/${orderId}/${randomUUID()}_${segment}`;
    const ab = await file.arrayBuffer();
    const bytes = new Uint8Array(ab);

    const mime = file.type.trim() || "application/octet-stream";

    const { error: upErr } = await admin.storage
      .from(ORDER_DOCUMENT_STORAGE_BUCKET)
      .upload(path, bytes, {
        contentType: mime,
        upsert: false,
      });
    if (upErr) {
      return NextResponse.json({ error: `Storage 업로드 실패: ${upErr.message}` }, { status: 500 });
    }

    const { data: row, error: insErr } = await admin
      .from("order_documents")
      .insert({
        order_id: orderId,
        storage_path: path,
        file_name: displayName,
        content_type: mime,
        uploaded_by: user.id,
      })
      .select("id, file_name")
      .single();

    if (insErr || !row) {
      return NextResponse.json(
        { error: `DB 저장 실패: ${insErr?.message ?? "unknown"}` },
        { status: 500 }
      );
    }
    inserted.push({ id: row.id, file_name: row.file_name });
  }

  return NextResponse.json({ ok: true, inserted });
}
