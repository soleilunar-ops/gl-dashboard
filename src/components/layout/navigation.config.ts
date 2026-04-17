import { navOrders } from "./nav-orders";
import { navForecast } from "./nav-forecast";
import { navReviews } from "./nav-reviews";
import { navLogistics } from "./nav-logistics";

export interface NavItem {
  label: string;
  path: string;
  icon: string; // lucide-react 아이콘 이름
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const navigation: NavGroup[] = [
  { title: "주문", items: navOrders },
  { title: "분석", items: [...navForecast, ...navReviews] },
  { title: "물류", items: navLogistics },
];
