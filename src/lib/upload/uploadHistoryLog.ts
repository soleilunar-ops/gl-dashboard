/**
 * 업로드 이력 기록 — excel_uploads 테이블 공용 로그
 *
 * 테이블 선택 이유: `excel_uploads`는 PM이 사전 설계한 범용 업로드 이력 테이블이며
 * Storage 버킷(`excel-uploads`)과 쌍으로 동작. 나경 프로모션 업로드뿐 아니라
 * 추후 슬아·진희 영역 업로드도 같은 테이블에 기록해 전사 추적성 확보.
 *
 * 현 구현은 Storage 업로드 없이 메타만 기록 (storage_path NULL).
 * Storage 업로드 연결은 후속 작업.
 *
 * `as never` 캐스팅은 types.ts가 아직 `excel_uploads`를 반영하지 못한 과도기
 * 우회 패턴 (useMilkrunAllocations의 T_ALLOC 패턴과 동일). 다음 auto-types
 * 재생성 후 제거 권장.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

const T_EXCEL_UPLOADS = "excel_uploads" as never;

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
  }
): Promise<void> {
  const { error } = await supabase.from(T_EXCEL_UPLOADS).insert({
    file_name: params.fileName,
    category: params.fileType,
    period_start: params.periodStart,
    period_end: params.periodEnd,
    total_rows: params.rowCount,
    inserted_rows: params.rowCount,
    status: params.status,
    uploaded_at: new Date().toISOString(),
    uploaded_by: params.uploadedBy ?? null,
  } as never);
  if (error) throw new Error(`업로드 이력 저장 실패: ${error.message}`);
}
