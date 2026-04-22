/** 계약 서류 첨부 Storage 버킷 — 변경 이유: 마이그레이션 order-documents 와 코드 참조 일치 */
export const ORDER_DOCUMENT_STORAGE_BUCKET =
  process.env.ORDER_DOCUMENT_STORAGE_BUCKET?.trim() || "order-documents";
