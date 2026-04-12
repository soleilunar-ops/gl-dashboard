export default function AuthLayout({ children }: { children: React.ReactNode }) {
  // 인증 페이지는 사이드바/헤더 없이 전체 화면
  return <>{children}</>;
}
