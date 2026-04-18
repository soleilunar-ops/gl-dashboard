// 변경 이유: 팔렛트·충진율·재작업일·총비용 계산을 순수 함수로 분리해 화면 로직을 단순화했습니다.
import { COUPANG_CENTERS } from "../constants/coupangCenters";
import { COUPANG_PRODUCTS, type CoupangProduct } from "../constants/coupangProducts";
import type { OrderItemCalc, PurchaseOrder, PurchaseOrderCalc } from "../types/milkrun";

export function calcPallets(orderQty: number, palletQty: number): number {
  if (!Number.isFinite(orderQty) || !Number.isFinite(palletQty) || palletQty <= 0) {
    return 0;
  }
  return Math.ceil(orderQty / palletQty);
}

export function calcFillRate(orderQty: number, palletQty: number): number {
  if (!Number.isFinite(orderQty) || !Number.isFinite(palletQty) || palletQty <= 0) {
    return 0;
  }

  const remainder = orderQty % palletQty;
  if (remainder === 0) {
    return 100;
  }
  return Math.round((remainder / palletQty) * 100);
}

export function calcReworkDate(deliveryDate: string, offset: 1 | 2): string {
  const date = new Date(`${deliveryDate}T00:00:00`);
  date.setDate(date.getDate() - offset);
  return date.toISOString().split("T")[0] ?? deliveryDate;
}

export function calcPurchaseOrder(order: PurchaseOrder): PurchaseOrderCalc {
  const center = COUPANG_CENTERS.find((item) => item.name === order.centerName);
  if (!center) {
    throw new Error(`센터 정보를 찾을 수 없습니다: ${order.centerName}`);
  }

  const reworkDate = calcReworkDate(order.deliveryDate, order.reworkOffset);

  const itemsCalc: OrderItemCalc[] = order.items.map((item) => {
    const product =
      COUPANG_PRODUCTS.find((target) => target.id === item.productId) ??
      createFallbackProduct(item);

    const hasManual = typeof item.manualPallets === "number" && item.manualPallets > 0;
    const pallets = hasManual
      ? (item.manualPallets ?? 0)
      : calcPallets(item.orderQty, product.palletQty ?? 0);
    const fillRate = hasManual ? 100 : calcFillRate(item.orderQty, product.palletQty ?? 0);

    return {
      ...item,
      product,
      pallets,
      fillRate,
      milkrunCost: pallets * center.price,
    };
  });

  return {
    ...order,
    reworkDate,
    center,
    itemsCalc,
    totalPallets: itemsCalc.reduce((sum, item) => sum + item.pallets, 0),
    totalCost: itemsCalc.reduce((sum, item) => sum + item.milkrunCost, 0),
  };
}

function createFallbackProduct(item: PurchaseOrder["items"][number]): CoupangProduct {
  return {
    id: item.productId,
    company: "쿠팡",
    name: item.itemName ?? "미매핑 품목",
    unit: 0,
    carton: null,
    palletCarton: null,
    palletQty: null,
    stacking: item.externalSkuId ? `SKU ${item.externalSkuId}` : "",
  };
}
