"use client";

import type { Dispatch, SetStateAction } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
      <div className="relative md:w-64">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2" />
        <Input
          className="pl-8"
          placeholder="품목코드 / 품목명"
          value={filter.search}
          onChange={(e) => onFilterChange((prev) => ({ ...prev, search: e.target.value }))}
        />
      </div>

      <Select
        value={filter.productionType}
        onValueChange={(v) =>
          onFilterChange((prev) => ({
            ...prev,
            productionType: v as InventoryFilter["productionType"],
          }))
        }
      >
        <SelectTrigger className="h-9 w-[140px]">
          <SelectValue placeholder="유형 선택" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">유형 선택</SelectItem>
          <SelectItem value="수입">수입</SelectItem>
          <SelectItem value="제품">제품</SelectItem>
          <SelectItem value="상품">상품</SelectItem>
        </SelectContent>
      </Select>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="ml-auto"
        disabled={exportDisabled}
        onClick={() => onExportExcel()}
      >
        엑셀 다운로드
      </Button>
    </div>
  );
}
