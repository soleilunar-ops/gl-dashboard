import * as XLSX from "xlsx";

const MONTHLY_DATA_FILE = new URL(
  "./assets/월별_판매납품_광고비_현황_v2.xlsx",
  import.meta.url
).toString();
const PROMOTION_DATA_FILE = new URL(
  "./assets/쿠팡_프로모션_진행현황.xlsx",
  import.meta.url
).toString();
const CANCELED_CONTRACT_NO = "2105782";

const SHEET_LAYER1 = "① 월별합계_Layer1";
const SHEET_COST = "광고비등비용";

type Layer1Row = {
  monthKey: string;
  season: string;
  salesQty: number;
  salesAmount: number;
  supplyQty: number;
  supplyAmount: number;
};

type CostRow = {
  monthKey: string;
  couponCost: number;
  adCost: number;
  milkRunCost: number;
  premiumDataCost: number;
  totalCost: number;
};

export interface PromotionSalesOverlayPoint {
  monthKey: string;
  label: string;
  year: number;
  month: number;
  salesQty: number;
  salesAmount: number;
  couponCost: number;
  adCost: number;
  milkRunCost: number;
  premiumDataCost: number;
  totalCost: number;
  isSeason24: boolean;
}

export interface SeasonComparePoint {
  seasonMonthIndex: number;
  seasonMonthLabel: string;
  salesQty: number;
  supplyQty: number;
  totalCost: number;
  costRate: number;
  isEventOn: boolean;
}

export interface RoiMonthlyPoint {
  monthKey: string;
  label: string;
  year: number;
  month: number;
  supplyAmount: number;
  couponCost: number;
  adCost: number;
  milkRunCost: number;
  premiumDataCost: number;
  totalCost: number;
}

export interface BudgetPlannerReference {
  excludedContractCount: number;
  season25MonthlyWeights: Array<{
    seasonMonthIndex: number;
    monthKey: string;
    label: string;
    weight: number;
  }>;
}

export interface TimingCampaignMetric {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  spend: number;
  week1Sales: number;
  week2Sales: number;
  week4Sales: number;
  twoWeekGrowthRate: number;
  weeklySeries: Array<{
    weekStart: string;
    salesAmount: number;
  }>;
}

export interface TimingOptimizerDataset {
  excludedContractCount: number;
  campaigns: TimingCampaignMetric[];
  recommendationText: string;
}

export interface SeasonAlertPoint {
  seasonMonthIndex: number;
  monthKey: string;
  label: string;
  monthSupplyAmount: number;
  monthTotalCost: number;
  cumulativeSupplyAmount: number;
  cumulativeTotalCost: number;
  cumulativeCostRate: number;
}

export async function loadPromotionSalesOverlayDataset(): Promise<{
  points: PromotionSalesOverlayPoint[];
  excludedContractCount: number;
}> {
  const { layer1Rows, costRows, excludedContractCount } = await loadBaseData();
  const costMap = new Map(costRows.map((row) => [row.monthKey, row]));

  const points = layer1Rows
    .filter((row) => row.monthKey >= "2024-10" && row.monthKey <= "2026-03")
    .map((row) => {
      const cost = costMap.get(row.monthKey);
      const [year, month] = row.monthKey.split("-").map(Number);
      return {
        monthKey: row.monthKey,
        label: `${String(year).slice(2)}.${String(month).padStart(2, "0")}`,
        year,
        month,
        salesQty: row.salesQty,
        salesAmount: row.salesAmount,
        couponCost: cost?.couponCost ?? 0,
        adCost: cost?.adCost ?? 0,
        milkRunCost: cost?.milkRunCost ?? 0,
        premiumDataCost: cost?.premiumDataCost ?? 0,
        totalCost: cost?.totalCost ?? 0,
        isSeason24: row.season === "24-25",
      } satisfies PromotionSalesOverlayPoint;
    });

  return { points, excludedContractCount };
}

export async function loadSeasonCompareDataset(): Promise<{
  season24: SeasonComparePoint[];
  season25: SeasonComparePoint[];
  excludedContractCount: number;
}> {
  const { layer1Rows, costRows, excludedContractCount, promotionContracts } =
    await loadBaseData(true);
  const costMap = new Map(costRows.map((row) => [row.monthKey, row]));

  function toSeasonRows(targetSeason: "24-25" | "25-26") {
    return layer1Rows
      .filter((row) => row.season === targetSeason)
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
      .map((row, index) => {
        const cost = costMap.get(row.monthKey);
        const [year, month] = row.monthKey.split("-").map(Number);
        const isEventOn =
          targetSeason === "24-25"
            ? (cost?.couponCost ?? 0) > 0
            : promotionContracts.some((contract) =>
                isDateRangeOverMonth(contract.start, contract.end, year, month)
              );
        return {
          seasonMonthIndex: index + 1,
          seasonMonthLabel: `${index + 1}월차`,
          salesQty: row.salesQty,
          supplyQty: row.supplyQty,
          totalCost: cost?.totalCost ?? 0,
          costRate: row.salesAmount > 0 ? ((cost?.totalCost ?? 0) / row.salesAmount) * 100 : 0,
          isEventOn,
        } satisfies SeasonComparePoint;
      });
  }

  return {
    season24: toSeasonRows("24-25"),
    season25: toSeasonRows("25-26"),
    excludedContractCount,
  };
}

export async function loadRoiDataset(): Promise<{
  points: RoiMonthlyPoint[];
  excludedContractCount: number;
}> {
  const { layer1Rows, costRows, excludedContractCount } = await loadBaseData();
  const costMap = new Map(costRows.map((row) => [row.monthKey, row]));
  const points = layer1Rows
    .filter((row) => row.monthKey >= "2024-10" && row.monthKey <= "2026-02")
    .map((row) => {
      const cost = costMap.get(row.monthKey);
      const [year, month] = row.monthKey.split("-").map(Number);
      return {
        monthKey: row.monthKey,
        label: `${String(year).slice(2)}.${String(month).padStart(2, "0")}`,
        year,
        month,
        supplyAmount: row.salesAmount,
        couponCost: cost?.couponCost ?? 0,
        adCost: cost?.adCost ?? 0,
        milkRunCost: cost?.milkRunCost ?? 0,
        premiumDataCost: cost?.premiumDataCost ?? 0,
        totalCost: cost?.totalCost ?? 0,
      } satisfies RoiMonthlyPoint;
    });
  return { points, excludedContractCount };
}

export async function loadBudgetPlannerReference(): Promise<BudgetPlannerReference> {
  const { layer1Rows, costRows, excludedContractCount } = await loadBaseData();
  const season25Rows = layer1Rows.filter((row) => row.season === "25-26").slice(0, 7);
  const costMap = new Map(costRows.map((row) => [row.monthKey, row]));
  const weighted = season25Rows.map((row, index) => ({
    seasonMonthIndex: index + 1,
    monthKey: row.monthKey,
    label: `${row.monthKey.slice(2, 4)}.${row.monthKey.slice(5, 7)}`,
    totalCost: costMap.get(row.monthKey)?.totalCost ?? 0,
  }));
  const sum = weighted.reduce((acc, row) => acc + row.totalCost, 0);
  return {
    excludedContractCount,
    season25MonthlyWeights: weighted.map((row) => ({
      seasonMonthIndex: row.seasonMonthIndex,
      monthKey: row.monthKey,
      label: row.label,
      weight: sum > 0 ? row.totalCost / sum : 1 / weighted.length,
    })),
  };
}

export async function loadTimingOptimizerDataset(): Promise<TimingOptimizerDataset> {
  const { layer1Rows, excludedContractCount } = await loadBaseData();
  const dailySalesMap = buildDailySalesAmountMap(layer1Rows);

  const campaigns = TIMING_CAMPAIGNS.map((campaign) => {
    const start = parseDateString(campaign.startDate);
    const end = parseDateString(campaign.endDate);
    const weeklySeries = buildWeeklySeries(start, end, dailySalesMap);
    const week1Sales = weeklySeries.slice(0, 1).reduce((sum, row) => sum + row.salesAmount, 0);
    const week2Sales = weeklySeries.slice(0, 2).reduce((sum, row) => sum + row.salesAmount, 0);
    const week4Sales = weeklySeries.slice(0, 4).reduce((sum, row) => sum + row.salesAmount, 0);

    const baselineWeeks = buildWeeklySeries(addDays(start, -14), addDays(start, -1), dailySalesMap);
    const baselineAvg =
      baselineWeeks.length > 0
        ? baselineWeeks.reduce((sum, row) => sum + row.salesAmount, 0) / baselineWeeks.length
        : 0;
    const firstTwoWeekAvg = week2Sales / 2;
    const twoWeekGrowthRate =
      baselineAvg > 0 ? ((firstTwoWeekAvg - baselineAvg) / baselineAvg) * 100 : 0;

    return {
      ...campaign,
      week1Sales,
      week2Sales,
      week4Sales,
      twoWeekGrowthRate,
      weeklySeries,
    } satisfies TimingCampaignMetric;
  }).sort((a, b) => b.twoWeekGrowthRate - a.twoWeekGrowthRate);

  return {
    excludedContractCount,
    campaigns,
    recommendationText: `추천 집행 순서: ${campaigns
      .map((item, index) => `${index + 1}) ${item.label}`)
      .join(" → ")}`,
  };
}

export async function loadSeasonAlertDataset(): Promise<{
  excludedContractCount: number;
  points: SeasonAlertPoint[];
}> {
  const { layer1Rows, costRows, excludedContractCount } = await loadBaseData();
  const costMap = new Map(costRows.map((row) => [row.monthKey, row]));
  const seasonRows = layer1Rows.filter((row) => row.season === "25-26").slice(0, 7);

  let cumulativeSupplyAmount = 0;
  let cumulativeTotalCost = 0;
  const points = seasonRows.map((row, index) => {
    const cost = costMap.get(row.monthKey);
    const monthTotalCost = cost?.totalCost ?? 0;
    cumulativeSupplyAmount += row.salesAmount;
    cumulativeTotalCost += monthTotalCost;
    return {
      seasonMonthIndex: index + 1,
      monthKey: row.monthKey,
      label: `${index + 1}월차`,
      monthSupplyAmount: row.salesAmount,
      monthTotalCost,
      cumulativeSupplyAmount,
      cumulativeTotalCost,
      cumulativeCostRate:
        cumulativeSupplyAmount > 0 ? (cumulativeTotalCost / cumulativeSupplyAmount) * 100 : 0,
    } satisfies SeasonAlertPoint;
  });

  return { excludedContractCount, points };
}

async function loadBaseData(includeContracts = false) {
  const [monthlyWb, promotionWb] = await Promise.all([
    loadWorkbook(MONTHLY_DATA_FILE),
    loadWorkbook(PROMOTION_DATA_FILE),
  ]);
  const layer1Rows = parseLayer1Rows(monthlyWb.Sheets[SHEET_LAYER1]);
  const costRows = parseCostRows(monthlyWb.Sheets[SHEET_COST]);
  const promotion = parsePromotionSheet(promotionWb.Sheets["대표"], includeContracts);
  return {
    layer1Rows,
    costRows,
    excludedContractCount: promotion.excludedContractCount,
    promotionContracts: promotion.contracts,
  };
}

async function loadWorkbook(path: string) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`파일 로드 실패: ${path}`);
  const buffer = await response.arrayBuffer();
  return XLSX.read(buffer, { type: "array" });
}

function parseLayer1Rows(sheet?: XLSX.WorkSheet): Layer1Row[] {
  const rows = sheetRows(sheet);
  const dataRows = rows.slice(2).filter((row) => row[0] && row[1]);
  return dataRows.map((row) => ({
    monthKey: String(row[0]).trim(),
    season: String(row[1]).trim(),
    salesQty: toNumber(row[2]),
    salesAmount: toNumber(row[3]),
    supplyQty: toNumber(row[4]),
    supplyAmount: toNumber(row[5]),
  }));
}

function parseCostRows(sheet?: XLSX.WorkSheet): CostRow[] {
  const rows = sheetRows(sheet);
  const dataRows = rows.slice(2).filter((row) => row[0]);
  return dataRows.map((row) => {
    const ym = parseKoreanYearMonth(row[0]);
    const monthKey = ym ? `${ym.year}-${String(ym.month).padStart(2, "0")}` : "";
    const couponCost = toNumber(row[1]);
    const adCost = toNumber(row[2]);
    const milkRunCost = toNumber(row[3]);
    const premiumDataCost = toNumber(row[4]);
    return {
      monthKey,
      couponCost,
      adCost,
      milkRunCost,
      premiumDataCost,
      totalCost: couponCost + adCost + milkRunCost + premiumDataCost,
    };
  });
}

function parsePromotionSheet(sheet?: XLSX.WorkSheet, includeContracts = false) {
  const rows = sheetRows(sheet).slice(2);
  let excludedContractCount = 0;
  const contracts: Array<{ start: Date; end: Date }> = [];
  for (const row of rows) {
    const contractNo = String(row[2] ?? "").trim();
    if (!contractNo) continue;
    if (contractNo === CANCELED_CONTRACT_NO) {
      excludedContractCount += 1;
      continue;
    }
    if (!includeContracts) continue;
    const start = parseDateFlex(row[3]);
    const end = parseDateFlex(row[4]);
    if (start && end) contracts.push({ start, end });
  }
  return { excludedContractCount, contracts };
}

function sheetRows(sheet?: XLSX.WorkSheet) {
  if (!sheet) return [] as Array<Array<string | number | null>>;
  return XLSX.utils.sheet_to_json<Array<string | number | null>>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });
}

function parseKoreanYearMonth(value: unknown): { year: number; month: number } | null {
  const match = String(value ?? "").match(/(\d{2,4})\D+(\d{1,2})/);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
  return { year: y < 100 ? 2000 + y : y, month: m };
}

function parseDateFlex(value: unknown): Date | null {
  const s = String(value ?? "").trim();
  const m = s.match(/(\d{4})\D(\d{1,2})\D(\d{1,2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function parseDateString(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function isDateRangeOverMonth(start: Date, end: Date, year: number, month: number) {
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);
  return start <= monthEnd && end >= monthStart;
}

function buildDailySalesAmountMap(layer1Rows: Layer1Row[]) {
  const map = new Map<string, number>();
  for (const row of layer1Rows) {
    const [year, month] = row.monthKey.split("-").map(Number);
    const days = new Date(year, month, 0).getDate();
    const perDay = days > 0 ? row.salesAmount / days : 0;
    for (let day = 1; day <= days; day += 1) {
      map.set(toDateKey(new Date(year, month - 1, day)), perDay);
    }
  }
  return map;
}

function buildWeeklySeries(start: Date, end: Date, dailyMap: Map<string, number>) {
  const out: Array<{ weekStart: string; salesAmount: number }> = [];
  let cursor = new Date(start);
  while (cursor <= end) {
    const weekStart = new Date(cursor);
    const weekEnd = new Date(Math.min(addDays(weekStart, 6).getTime(), end.getTime()));
    let salesAmount = 0;
    let d = new Date(weekStart);
    while (d <= weekEnd) {
      salesAmount += dailyMap.get(toDateKey(d)) ?? 0;
      d = addDays(d, 1);
    }
    out.push({ weekStart: toDateKey(weekStart), salesAmount });
    cursor = addDays(weekStart, 7);
  }
  return out;
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function toDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toNumber(value: unknown) {
  const n = Number(String(value ?? "").replaceAll(",", ""));
  return Number.isFinite(n) ? n : 0;
}

const TIMING_CAMPAIGNS = [
  {
    id: "season-coupon",
    label: "시즌쿠폰",
    startDate: "2025-10-14",
    endDate: "2026-02-28",
    spend: 81000000,
  },
  {
    id: "ad-placement",
    label: "광고게재",
    startDate: "2025-10-07",
    endDate: "2026-01-29",
    spend: 240000000,
  },
  {
    id: "event-10",
    label: "10월이벤트",
    startDate: "2025-10-19",
    endDate: "2025-11-03",
    spend: 9650000,
  },
  {
    id: "event-11",
    label: "11월이벤트",
    startDate: "2025-11-11",
    endDate: "2025-12-05",
    spend: 14750000,
  },
  {
    id: "event-12",
    label: "12월이벤트",
    startDate: "2025-12-01",
    endDate: "2026-01-02",
    spend: 74400000,
  },
  {
    id: "event-1",
    label: "1월이벤트",
    startDate: "2026-01-01",
    endDate: "2026-02-03",
    spend: 153980000,
  },
] as const;
