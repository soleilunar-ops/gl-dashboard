/**
 * 직접 첨부 엑셀 원본 파일 Supabase Storage 버킷 — 변경 이유: 프로젝트 버킷명(excel-uploads)과 코드 참조 일치
 * 필요 시 .env 에 EXCEL_UPLOAD_STORAGE_BUCKET 만 덮어쓰기
 */
export const ORDER_EXCEL_STORAGE_BUCKET =
  process.env.EXCEL_UPLOAD_STORAGE_BUCKET?.trim() || "excel-uploads";
