"use client";

import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type InventoryFilter = {
  search: string;
  productionType: "all" | "수입" | "제품" | "상품";
};

interface FilterBarProps {
  filter: InventoryFilter;
  onFilterChange: Dispatch<SetStateAction<InventoryFilter>>;
  /** 현재 필터가 적용된 전체 목록을 시트로 저장 (페이지와 무관) */
  onExportExcel: () => void;
  exportDisabled?: boolean;
}

export function FilterBar({
  filter,
  onFilterChange,
  onExportExcel,
  exportDisabled = false,
}: FilterBarProps) {
  return (
    <div className="bg-card flex flex-wrap items-center gap-2 rounded-lg border p-3">
      <Input
        className="md:w-64"
        placeholder="품목코드 / 품목명"
        value={filter.search}
        onChange={(e) => onFilterChange((prev) => ({ ...prev, search: e.target.value }))}
      />

      <div className="bg-muted/30 flex items-center gap-1 rounded-lg border p-1">
        {(["all", "수입", "제품", "상품"] as const).map((type) => (
          <Button
            key={type}
            type="button"
            variant={filter.productionType === type ? "default" : "ghost"}
            size="sm"
            className={cn(filter.productionType === type && "shadow-sm")}
            onClick={() => onFilterChange((prev) => ({ ...prev, productionType: type }))}
          >
            {type === "all" ? "전체" : type}
          </Button>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={exportDisabled}
        onClick={() => onExportExcel()}
      >
        엑셀 추출
      </Button>
    </div>
  );
}
