// 변경 이유: 쿠팡 밀크런 발주/계산 데이터 구조를 타입으로 고정해 화면·유틸 간 일관성을 확보했습니다.
import type { CoupangCenter } from "../constants/coupangCenters";
import type { CoupangProduct } from "../constants/coupangProducts";

export interface OrderItem {
  productId: string;
  orderQty: number;
  manualPallets?: number;
  itemName?: string;
  externalSkuId?: string;
}

export interface PurchaseOrder {
  id: string;
  orderNumber: string;
  centerName: string;
  deliveryDate: string;
  reworkOffset: 1 | 2;
  items: OrderItem[];
  memo: string;
  createdAt: string;
}

export interface OrderItemCalc extends OrderItem {
  product: CoupangProduct;
  pallets: number;
  fillRate: number;
  milkrunCost: number;
}

export interface PurchaseOrderCalc extends PurchaseOrder {
  reworkDate: string;
  center: CoupangCenter;
  itemsCalc: OrderItemCalc[];
  totalPallets: number;
  totalCost: number;
}
