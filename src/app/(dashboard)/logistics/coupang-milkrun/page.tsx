// 변경 이유: 물류 메뉴에서 쿠팡 밀크런 관리 화면으로 진입할 수 있도록 대시보드 라우트를 추가했습니다.
import CoupangMilkrunPage from "@/components/logistics/CoupangMilkrunPage";

export const dynamic = "force-dynamic";

export default function Page() {
  return <CoupangMilkrunPage />;
}
