"use client";

import { useMemo } from "react";

import EmptyState from "@/components/shared/EmptyState";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import type { Product, ProductCapacity } from "./_hooks/useProducts";

/** 그룹 순서 고정 — 스펙: 160g → 100g → 80g → 미니 → 기타 */
const GROUP_ORDER: ProductCapacity[] = ["160g", "100g", "80g", "미니", "기타"];

type Props = {
  products: Product[];
  selected: Product | null;
  onSelect: (product: Product | null) => void;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
};

/**
 * 상품 선택 콤보박스 — 변경 이유: shadcn command 미설치 환경에서 native select 대체
 * optgroup으로 용량별 그룹핑 유지.
 */
export default function ProductCombobox({
  products,
  selected,
  onSelect,
  isLoading,
  error,
  onRetry,
}: Props) {
  const grouped = useMemo(() => {
    const map = new Map<ProductCapacity, Product[]>();
    GROUP_ORDER.forEach((cap) => map.set(cap, []));
    products.forEach((p) => map.get(p.capacity)?.push(p));
    return GROUP_ORDER.filter((cap) => (map.get(cap) ?? []).length > 0).map((cap) => ({
      capacity: cap,
      items: map.get(cap) ?? [],
    }));
  }, [products]);

  if (error) {
    return (
      <div className="space-y-2">
        <Label>상품</Label>
        <div className="rounded-md border border-red-200 bg-red-50 p-4">
          <EmptyState message={`상품 조회 실패: ${error}`} />
          <div className="mt-2 flex justify-center">
            <Button variant="outline" size="sm" onClick={onRetry}>
              재시도
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Label>상품</Label>
        <div className="rounded-md border">
          <LoadingSpinner size="sm" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="cost-product-select">상품 선택</Label>
      <select
        id="cost-product-select"
        value={selected?.id ?? ""}
        onChange={(e) => {
          const id = e.target.value;
          if (!id) {
            onSelect(null);
            return;
          }
          const found = products.find((p) => p.id === id) ?? null;
          onSelect(found);
        }}
        className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <option value="">— 상품을 선택하세요 —</option>
        {grouped.map((g) => (
          <optgroup key={g.capacity} label={g.capacity}>
            {g.items.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {selected && (
        <p className="text-muted-foreground text-xs">
          원가 {selected.unitCost.toLocaleString("ko-KR")}원 · 1파렛트 적재{" "}
          {selected.unitsPerPallet.toLocaleString("ko-KR")}개
        </p>
      )}
    </div>
  );
}
