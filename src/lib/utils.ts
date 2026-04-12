import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

// shadcn/ui 필수
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// 날짜 포맷
export function formatDate(date: string | Date, pattern = "yyyy-MM-dd") {
  return format(new Date(date), pattern, { locale: ko });
}

// 숫자 포맷 (천 단위 콤마)
export function formatNumber(num: number) {
  return new Intl.NumberFormat("ko-KR").format(num);
}

// 원화 포맷
export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
  }).format(amount);
}
