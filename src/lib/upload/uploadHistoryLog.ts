/**
 * upload_history 기록
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export async function logUploadHistory(
  supabase: SupabaseClient<Database>,
  params: {
    fileName: string;
    fileType: string;
    periodStart: string;
    periodEnd: string;
    rowCount: number;
    status: "success" | "failed" | "partial";
    uploadedBy?: string | null;
  }
): Promise<void> {
  const { error } = await supabase.from("upload_history").insert({
    file_name: params.fileName,
    file_type: params.fileType,
    period_start: params.periodStart,
    period_end: params.periodEnd,
    row_count: params.rowCount,
    status: params.status,
    uploaded_at: new Date().toISOString(),
    uploaded_by: params.uploadedBy ?? null,
  });
  if (error) throw new Error(`업로드 이력 저장 실패: ${error.message}`);
}
