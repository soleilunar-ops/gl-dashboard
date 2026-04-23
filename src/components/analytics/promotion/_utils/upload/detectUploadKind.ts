/** 업로드 파일명으로 데이터 종류 판별 */
export type UploadKind = "daily_performance" | "delivery_detail" | "coupon" | "milkrun" | null;

export function detectUploadKind(fileName: string): UploadKind {
  const n = fileName.toLowerCase();
  if (n.startsWith("daily_performance")) return "daily_performance";
  if (n.includes("coupang_stocked")) return "delivery_detail";
  if (n.startsWith("coupon")) return "coupon";
  if (n.startsWith("milkrun")) return "milkrun";
  return null;
}
