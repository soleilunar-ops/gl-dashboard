"use client";

import { MarginCalculator } from "./MarginCalculator";

/**
 * 주문 영역 메인 레이아웃 — 섹션1(계약)·섹션2(마진)
 * 변경 이유: GL-RADS 마진 계산기 섹션 배치
 */
export default function OrdersMain() {
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="orders-section1-heading" className="flex flex-col gap-3">
        <h2 id="orders-section1-heading" className="text-lg font-semibold tracking-tight">
          섹션 1 · 계약 선택
        </h2>
        {/* TODO: 섹션1에서 선택한 계약건의 cnyUnitPrice, qShip, qTotal, exFinal 등을 MarginCalculator에 props 또는 Context로 전달 (별도 이슈에서 구현). */}
        <p className="text-muted-foreground text-sm">선택 계약 요약이 들어갈 영역입니다.</p>
      </section>

      <section aria-labelledby="orders-section2-heading" className="flex flex-col gap-3">
        <h2 id="orders-section2-heading" className="text-lg font-semibold tracking-tight">
          섹션 2 · 마진 계산 (GL-RADS)
        </h2>
        <MarginCalculator />
      </section>
    </div>
  );
}
