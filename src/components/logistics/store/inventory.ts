"use client";

import { create } from "zustand";

export interface InventoryFilterState {
  keyword: string;
  productionType: "all" | "국내생산" | "수입";
}

interface InventoryUiState {
  selectedItemId: number | null;
  filters: InventoryFilterState;
  setSelectedItemId: (itemId: number | null) => void;
  setFilters: (filters: Partial<InventoryFilterState>) => void;
  resetFilters: () => void;
}

const defaultFilters: InventoryFilterState = {
  keyword: "",
  productionType: "all",
};

export const useInventoryStore = create<InventoryUiState>((set) => ({
  selectedItemId: null,
  filters: defaultFilters,
  setSelectedItemId: (selectedItemId) => set({ selectedItemId }),
  setFilters: (nextFilters) =>
    set((state) => ({
      filters: {
        ...state.filters,
        ...nextFilters,
      },
    })),
  resetFilters: () => set({ filters: defaultFilters }),
}));
