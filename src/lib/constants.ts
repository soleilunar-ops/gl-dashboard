export const FASTAPI_URL = process.env.NEXT_PUBLIC_FASTAPI_URL || "http://localhost:8000";

// 재고 상태
export const STOCK_STATUS = {
  NORMAL: "정상",
  STOCKOUT: "품절",
  NEGATIVE: "⚠️마이너스",
} as const;

// 입출고 유형
export const MOVEMENT_TYPES = {
  INBOUND: "입고",
  OUTBOUND: "출고",
  ADJUSTMENT: "재고조정",
} as const;

// 품목 카테고리
export const CATEGORIES = [
  "파스형",
  "160g",
  "150g",
  "100g",
  "80g",
  "30g",
  "발난로",
  "아이워머",
  "아랫배",
  "기능성",
  "냉온찜질팩",
  "쿨링",
  "제습제",
  "기타",
  "의료기기",
] as const;

// 쿠팡 매핑 정확도
export const MAPPING_ACCURACY = {
  HIGH: "★★★",
  MEDIUM: "★★☆",
  LOW: "★☆☆",
} as const;
