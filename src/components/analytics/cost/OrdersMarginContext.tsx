"use client";

import { createContext, useContext, type ReactNode } from "react";

/** 마진 계산기로 넘기는 주문·시나리오 동기화 필드(추후 주문 화면·URL 연동용) */
export interface OrdersMarginSelectedOrder {
  cnyCostPerUnit: number;
  /** 송금(잔금 70%) 진행률 기준 정규화 수량 — ExFinal의 QShip/QTotal에 직접 반영 */
  qShip: number;
  qTotal: number;
  /**
   * 송금 기록의 적용 환율(PI 시점). null이면 미기록 — 현재 환율로 대체하지 않음(PI 가중 왜곡 방지).
   */
  exPI: number | null;
  erpCode?: string | null;
}

const OrdersMarginContext = createContext<OrdersMarginSelectedOrder | null>(null);

export function OrdersMarginProvider({
  value,
  children,
}: {
  value: OrdersMarginSelectedOrder | null;
  children: ReactNode;
}) {
  return <OrdersMarginContext.Provider value={value}>{children}</OrdersMarginContext.Provider>;
}

export function useOrdersMarginSelectedOrder(): OrdersMarginSelectedOrder | null {
  return useContext(OrdersMarginContext);
}
