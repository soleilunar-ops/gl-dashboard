export interface CenterCostProfile {
  center: string;
  milkRunUnitCost: number;
  palletLoadQty: number;
  palletReworkCost: number;
}

export const CENTER_COST_PROFILES: CenterCostProfile[] = [
  { center: "이천", milkRunUnitCost: 68000, palletLoadQty: 84, palletReworkCost: 9000 },
  { center: "안성", milkRunUnitCost: 62500, palletLoadQty: 80, palletReworkCost: 8500 },
  { center: "곤지암", milkRunUnitCost: 70200, palletLoadQty: 88, palletReworkCost: 9300 },
];

export interface CsvCostMap {
  [center: string]: CenterCostProfile;
}

const sanitizeValue = (value: string) => value.trim().replaceAll('"', "");

const parseNumber = (value: string) => {
  const normalized = sanitizeValue(value).replaceAll(",", "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

export function parseCenterCostCsv(csvText: string): CsvCostMap {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return {};
  }

  const headers = lines[0].split(",").map((value) => sanitizeValue(value).toLowerCase());
  const indexByKey = {
    center: headers.findIndex((header) => /센터|center/.test(header)),
    milkRunUnitCost: headers.findIndex((header) => /밀크런|milk/.test(header)),
    palletLoadQty: headers.findIndex((header) => /적재|load/.test(header)),
    palletReworkCost: headers.findIndex((header) => /재작업|rework/.test(header)),
  };

  if (
    indexByKey.center < 0 ||
    indexByKey.milkRunUnitCost < 0 ||
    indexByKey.palletLoadQty < 0 ||
    indexByKey.palletReworkCost < 0
  ) {
    return {};
  }

  return lines.slice(1).reduce<CsvCostMap>((acc, line) => {
    const cells = line.split(",");
    const center = sanitizeValue(cells[indexByKey.center] ?? "");
    const milkRunUnitCost = parseNumber(cells[indexByKey.milkRunUnitCost] ?? "");
    const palletLoadQty = parseNumber(cells[indexByKey.palletLoadQty] ?? "");
    const palletReworkCost = parseNumber(cells[indexByKey.palletReworkCost] ?? "");

    if (
      center.length > 0 &&
      milkRunUnitCost !== null &&
      palletLoadQty !== null &&
      palletLoadQty > 0 &&
      palletReworkCost !== null
    ) {
      acc[center] = {
        center,
        milkRunUnitCost,
        palletLoadQty,
        palletReworkCost,
      };
    }
    return acc;
  }, {});
}

export const DEFAULT_CENTER_COST_MAP: CsvCostMap = CENTER_COST_PROFILES.reduce<CsvCostMap>(
  (acc, profile) => {
    acc[profile.center] = profile;
    return acc;
  },
  {}
);
