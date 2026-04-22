import { navOrders } from "./nav-orders";
import { navForecast } from "./nav-forecast";
import { navPromotion } from "./nav-promotion";
import { navLogistics } from "./nav-logistics";
import { navWeatherkey } from "./nav-weatherkey";

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
  { title: "분석", items: [...navForecast, ...navPromotion, ...navWeatherkey] },
  { title: "물류", items: navLogistics },
];
