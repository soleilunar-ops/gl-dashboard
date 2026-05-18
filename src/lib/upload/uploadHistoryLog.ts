/**
 * 업로드 이력 기록 — excel_uploads 테이블 공용 로그
 *
 * 테이블 선택 이유: `excel_uploads`는 PM이 사전 설계한 범용 업로드 이력 테이블이며
 * Storage 버킷(`excel-uploads`)과 쌍으로 동작. 나경 프로모션 업로드뿐 아니라
 * 추후 슬아·진희 영역 업로드도 같은 테이블에 기록해 전사 추적성 확보.
 *
 * file 인자가 들어오면 Storage(`excel-uploads`) 업로드도 함께 수행하고
 * 성공 시 storage_path 컬럼에 기록. 업로드 실패해도 메타 INSERT는 계속(이력 유실 방지).
 *
 * `as never` 캐스팅은 types.ts가 아직 `excel_uploads`를 반영하지 못한 과도기
 * 우회 패턴 (useMilkrunAllocations의 T_ALLOC 패턴과 동일). 다음 auto-types
 * 재생성 후 제거 권장.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

const T_EXCEL_UPLOADS = "excel_uploads" as never;
const STORAGE_BUCKET = "excel-uploads";

/** Storage 객체 키용 파일명 정규화 — 변경 이유: Supabase Storage가 비-ASCII 키 거부(예: 한글 파일명) → 영숫자/점/대시/언더바만 허용. 원본 파일명은 excel_uploads.file_name에 한글 그대로 보존 */
function safeStorageSegment(name: string): string {
  const t = name.trim() || "upload.xlsx";
  const cleaned = t.replace(/[^\w.\-]/g, "_").slice(0, 140);
  return cleaned || "upload.xlsx";
}

/** 호출부 시그니처는 그대로 두고 DB 제약값으로 매핑 — 변경 이유: DB CHECK는 pending/processing/completed/failed/cancelled만 허용 */
function toDbStatus(s: "success" | "failed" | "partial"): "completed" | "failed" {
  if (s === "failed") return "failed";
  // partial(일부 성공)도 completed로 — DB enum에 partial 없음, 부분 성공도 작업은 완료된 것으로 간주
  return "completed";
}

export async function logUploadHistory(
  supabase: SupabaseClient<Database>,
  params: {
    fileName: string;
    fileType: string; // excel_uploads.category 매핑값 (예: "coupon_contracts")
    periodStart: string;
    periodEnd: string;
    rowCount: number; // 적재된 행수 (inserted_rows/total_rows 공통 사용)
    status: "success" | "failed" | "partial";
    uploadedBy?: string | null;
    /** 원본 File 객체 — 있으면 Storage 업로드 시도 */
    file?: File;
    /** Storage path 접두사용 user id — 없으면 "anonymous" */
    userId?: string;
  }
): Promise<void> {
  let storagePath: string | null = null;
  let storageError: string | null = null;

  // Storage 업로드 — file이 있으면 시도, 실패해도 메타 INSERT는 계속
  if (params.file && params.file.size > 0) {
    const segment = safeStorageSegment(params.file.name || params.fileName);
    const uid = params.userId ?? "anonymous";
    const path = `${uid}/${globalThis.crypto.randomUUID()}_${segment}`;
    const { error: upErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, params.file, { upsert: false });
    if (upErr) {
      storageError = `Storage 업로드 실패: ${upErr.message}`;
    } else {
      storagePath = path;
    }
  }

  const { error } = await supabase.from(T_EXCEL_UPLOADS).insert({
    file_name: params.fileName,
    category: params.fileType,
    period_start: params.periodStart,
    period_end: params.periodEnd,
    total_rows: params.rowCount,
    inserted_rows: params.rowCount,
    status: toDbStatus(params.status),
    storage_path: storagePath,
    error_message: storageError,
    uploaded_at: new Date().toISOString(),
    uploaded_by: params.uploadedBy ?? params.userId ?? null,
  } as never);
  if (error) throw new Error(`업로드 이력 저장 실패: ${error.message}`);
}
