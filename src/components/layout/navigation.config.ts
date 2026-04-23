import { navOrders } from "./nav-orders";
import { navLogistics } from "./nav-logistics";
import { navWeatherkey } from "./nav-weatherkey";

export interface NavItem {
  label: string;
  path: string;
  icon: string; // lucide-react 아이콘 이름
}

export interface NavGroup {
  title: string; // 빈 문자열이면 그룹 라벨 숨김 (최상단 단일 항목용)
  items: NavItem[];
}

export const navigation: NavGroup[] = [
  {
    title: "",
    items: [{ label: "대시보드", path: "/dashboard", icon: "LayoutDashboard" }],
  },
  { title: "주문", items: navOrders },
  { title: "분석", items: navWeatherkey },
  { title: "물류", items: navLogistics },
];
