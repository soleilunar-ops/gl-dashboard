// 변경 이유: 센터별 파렛트 배정에 따른 비용·비중 계산을 순수 함수로 분리했습니다.
export interface AllocationInput {
  name: string;
  basic: number;
  pallets: number;
}

export interface AllocationRow extends AllocationInput {
  cost: number;
  sharePct: number;
}

export interface ComputeResult {
  rows: AllocationRow[];
  totalCost: number;
  totalPallets: number;
  avgPerPallet: number;
}

export function computeAllocations(alloc: AllocationInput[]): ComputeResult {
  const rowsWithCost = alloc.map((a) => ({
    ...a,
    cost: a.basic * a.pallets,
    sharePct: 0,
  }));
  const totalCost = rowsWithCost.reduce((s, r) => s + r.cost, 0);
  const totalPallets = rowsWithCost.reduce((s, r) => s + r.pallets, 0);
  const rows: AllocationRow[] = rowsWithCost
    .map((r) => ({
      ...r,
      sharePct: totalCost > 0 ? (r.cost / totalCost) * 100 : 0,
    }))
    .sort((a, b) => a.basic - b.basic);
  return {
    rows,
    totalCost,
    totalPallets,
    avgPerPallet: totalPallets > 0 ? Math.round(totalCost / totalPallets) : 0,
  };
}
