import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16 규약: middleware → proxy 로 이름 변경됨
// 이 파일은 비로그인 상태 리다이렉트 + Supabase 세션 쿠키 자동 갱신 담당
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // api, _next, 정적파일 제외
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
