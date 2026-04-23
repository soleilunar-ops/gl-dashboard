// docs/VISUAL_REFERENCE.md §10 — chart.js 전용 JS 토큰 모듈.
// 팔레트 A (쿨 블루) · 7구간 대비 강화판.
// HEX는 globals.css와 3곳 동시 수정 필수 (§12 변경 규약).

export const TEMP_BANDS = [
  { min: 15, label: "따뜻", color: "#FFE8D0" }, // 크림
  { min: 10, label: "10~15℃", color: "#D4E8DC" }, // 연한 민트
  { min: 5, label: "쌀쌀", color: "#9DC8DC" }, // 하늘
  { min: 0, label: "체감겨울", color: "#5B95C7" }, // 밝은 블루
  { min: -5, label: "영하", color: "#2B6DA3" }, // 중간 남색
  { min: -10, label: "한파", color: "#0D3D7A" }, // 짙은 블루
  { min: -Infinity, label: "강한파", color: "#041A40" }, // 흑남색
] as const;

export type TempBand = (typeof TEMP_BANDS)[number];

export function tempCategory(t: number): TempBand {
  return TEMP_BANDS.find((b) => t >= b.min)!;
}

export const CHART_TOKENS = {
  lineTemp: "#F2BE5C",
  /** 기온 축 / 기준선용 회색 텍스트 — 차트 장식 텍스트는 기본 회색으로 통일 */
  axisTempText: "#6B7280",
  lineMa: "#5B95C7",
  zeroLine: "rgba(107, 114, 128, 0.55)",
  // 이벤트 마커 — 블루 바 팔레트와 대비되는 #A90000 레드 계열
  eventMarker: {
    featured: "#A90000",
    normal: "rgba(169, 0, 0, 0.55)",
    label: "#A90000",
  },
  triggerMarker: {
    cold_shock: "rgba(184, 74, 46, 0.85)", // 터라코타 빨강 — 기온 블루와 대비
    compound: "rgba(138, 40, 20, 0.9)", // 어두운 붉은색
    first_freeze: "rgba(217, 119, 87, 0.85)", // 오렌지
    search_spike_hotpack: "rgba(184, 142, 90, 0.8)", // 앰버
    search_spike_any: "rgba(145, 142, 132, 0.7)", // 회색
  },
  tooltip: {
    bg: "rgba(248, 252, 255, 0.98)",
    fg: "#041A40",
    subFg: "#0D3D7A",
    border: "rgba(10, 38, 71, 0.3)",
  },
  grid: "rgba(10, 38, 71, 0.07)",
  zoomDrag: "rgba(43, 109, 163, 0.14)",
} as const;

// 키워드 5색 — 블루 팔레트 배경과 구분되도록 빨강·티얼·앰버·플럼·올리브
export const KEYWORD_COLORS = [
  "#B84A2E", // slot 1 — Terracotta (가장 주목)
  "#4B8A82", // slot 2 — Teal
  "#B88E5A", // slot 3 — Amber
  "#6B5A8E", // slot 4 — Plum
  "#7A8E4B", // slot 5 — Olive
] as const;

// v_hotpack_trigger_effects.trigger_key 기준 5종 + 3단계 심각도.
export const TRIGGER_COLORS = {
  cold_shock: { hex: "#B84A2E", level: "critical" },
  compound: { hex: "#8A2814", level: "critical" },
  first_freeze: { hex: "#D97757", level: "high" },
  search_spike_hotpack: { hex: "#B88E5A", level: "high" },
  search_spike_any: { hex: "#918E84", level: "medium" },
} as const;

export type TriggerName = keyof typeof TRIGGER_COLORS;
export type TriggerLevel = (typeof TRIGGER_COLORS)[TriggerName]["level"];

// 중복 발동 시 이 순서로 우선 1개만 전면 카드로 노출.
// search_spike_* 양쪽 모두 UI 노출에서 제외:
//  - search_spike_hotpack 정밀도 30% (PM 결정 2026-04-21)
//  - search_spike_any 적중률 27% — 경보로 무의미, 노이즈 (PM 결정 2026-04-22)
export const TRIGGER_PRIORITY: readonly TriggerName[] = [
  "compound",
  "cold_shock",
  "first_freeze",
] as const;

export const TRIGGER_LABELS: Record<TriggerName, string> = {
  cold_shock: "갑작스러운 추위",
  compound: "한파+영하 동시",
  first_freeze: "첫 영하",
  search_spike_hotpack: "핫팩 검색 급등",
  search_spike_any: "관련 키워드 급등",
};

export const HEALTH_THRESHOLDS = {
  good: 2,
  warn: 5,
} as const;

export function healthLevel(daysBehind: number | null | undefined): "good" | "warn" | "bad" {
  if (daysBehind == null) return "bad";
  if (daysBehind <= HEALTH_THRESHOLDS.good) return "good";
  if (daysBehind <= HEALTH_THRESHOLDS.warn) return "warn";
  return "bad";
}
