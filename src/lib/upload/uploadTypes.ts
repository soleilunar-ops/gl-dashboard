/** 업로드 겹침 처리 방식 */
export type UploadConflictMode = "replace" | "skip";

export type UploadResult = {
  inserted: number;
  updated: number;
  errors: string[];
  periodStart: string;
  periodEnd: string;
};
