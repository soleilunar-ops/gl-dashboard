"use client";

import { useInventoryStore } from "../store/inventory";

interface FilterBarProps {
  onExport: () => void;
}

export function FilterBar({ onExport }: FilterBarProps) {
  const { filters, setFilters, resetFilters } = useInventoryStore();

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-white p-3">
      <input
        className="w-full rounded border px-3 py-2 text-sm md:w-64"
        placeholder="품목명 / ERP 코드 검색"
        value={filters.keyword}
        onChange={(event) => setFilters({ keyword: event.target.value })}
      />

      <div className="flex items-center gap-1 rounded border p-1">
        {(["all", "국내생산", "수입"] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setFilters({ productionType: type })}
            className={`rounded px-3 py-1.5 text-sm ${
              filters.productionType === type
                ? "bg-slate-900 text-white"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            {type === "all" ? "전체" : type}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
        onClick={resetFilters}
      >
        필터 초기화
      </button>

      <button
        type="button"
        className="rounded bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700"
        onClick={onExport}
      >
        엑셀 추출
      </button>
    </div>
  );
}
