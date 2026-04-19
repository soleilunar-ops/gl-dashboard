import type { createClient } from "@/lib/supabase/client";

/** supabase/types 반영 전까지 as never 우회를 위한 브라우저 클라이언트 타입 */
export type SupabaseBrowserClient = ReturnType<typeof createClient>;

/** DB allocations 행 (types 미반영 시 수동 정의) */
export type DbAllocation = {
  id: number;
  order_date: string;
  total_cost: number;
  total_pallets: number;
  center_count: number;
  memo: string | null;
  created_at: string;
  updated_at: string;
};

/** DB allocation_items 행 */
export type DbAllocationItem = {
  id: number;
  allocation_id: number;
  center_name: string;
  basic_price: number;
  pallet_count: number;
  line_cost: number;
};

// supabase/types 미반영 우회 — as never 패턴 유지
export const T_ALLOC = "allocations" as never;
export const T_ITEMS = "allocation_items" as never;

export type MilkrunSaveLineInput = {
  centerName: string;
  basicPrice: number;
  palletCount: number;
};

export type MilkrunHistorySummary = {
  count: number;
  totalCost: number;
  totalPallets: number;
  avgCostPerRecord: number;
};

export type MilkrunHistoryRecord = {
  id: number;
  orderDate: string;
  totalCost: number;
  totalPallets: number;
  centerCount: number;
  memo: string | null;
  createdAt: string;
};

export type MilkrunDailyRow = {
  date: string;
  cost: number;
  pallets: number;
};

export type MilkrunDetailItem = {
  centerName: string;
  basicPrice: number;
  palletCount: number;
  lineCost: number;
  sharePct: number;
};

export type MilkrunDetail = {
  id: number;
  orderDate: string;
  totalCost: number;
  totalPallets: number;
  centerCount: number;
  memo: string | null;
  createdAt: string;
  items: MilkrunDetailItem[];
};

/** 기간 CSV: 배정 1건당 센터별로 한 줄 */
export type MilkrunExportLine = {
  allocationId: number;
  orderDate: string;
  createdAt: string;
  memo: string | null;
  centerName: string;
  basicPrice: number;
  palletCount: number;
  lineCost: number;
  sharePct: number;
};
