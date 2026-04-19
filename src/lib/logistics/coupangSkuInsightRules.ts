/**
 * 쿠팡 SKU·센터별 집계 사실(facts)만으로 규칙 기반 인사이트·액션 문구를 만든다.
 * LLM 없이도 동작하며, API는 동일 facts로 서술만 보강할 때 재사용한다.
 */

export type CoupangSkuInsightFacts = {
  displayName: string;
  sku_id: string;
  center: string;
  barcode: string | null;
  purchase_cost: number | null;
  gl_mapped: boolean;
  gl_stock: number | null;
  gl_base_cost: number | null;
  bundle_ratio: number | null;
  coupang_current_stock: number;
  coupang_is_stockout: boolean;
  order_status: string | null;
  order_status_detail: string | null;
  chart_from: string | null;
  chart_to: string | null;
  chart_day_count: number;
  total_inbound_in_range: number;
  avg_daily_inbound: number;
  total_outbound_in_range: number;
  avg_daily_outbound: number;
  stockout_streak_days: number;
  /** 일별 출고 막대가 초반 대비 후반에 크게 꺾였는지 */
  outbound_drop_detected?: boolean;
  /** 급감이 두드러지기 시작한 근사 기준일 */
  outbound_drop_boundary_date?: string | null;
  outbound_early_avg?: number | null;
  outbound_late_avg?: number | null;
  /** late/early 비율(0~1). 작을수록 급락 */
  outbound_late_to_early_ratio?: number | null;
};

export type RuleInsightBlock = {
  title: string;
  body: string;
};

export type RuleActionRow = {
  badge: string;
  text: string;
};

export type RuleBasedCoupangInsight = {
  highlights: RuleInsightBlock[];
  pattern: string;
  asset: string;
  actions: RuleActionRow[];
};

function formatWon(n: number): string {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(n);
}

function approxGlSets(glStock: number, bundle: number | null): string | null {
  if (!bundle || bundle <= 0 || glStock <= 0) return null;
  const sets = Math.round(glStock / bundle);
  return `≈${sets.toLocaleString("ko-KR")}세트(번들 ${bundle})`;
}

/**
 * 기간 앞쪽 vs 뒤쪽 일평균 출고를 비교해 '훅' 하락 구간이 있는지 본다.
 * (CSV 일별 행이 시간순으로 있을 때만 의미 있음)
 */
export function analyzeOutboundDrop(
  series: { op_date: string; outbound_qty: number }[],
  minDays = 14
): {
  detected: boolean;
  boundary_op_date: string | null;
  early_avg: number;
  late_avg: number;
  late_to_early_ratio: number | null;
} {
  const empty = {
    detected: false,
    boundary_op_date: null,
    early_avg: 0,
    late_avg: 0,
    late_to_early_ratio: null as number | null,
  };
  if (series.length < minDays) return empty;

  const n = series.length;
  const earlyLen = Math.max(3, Math.floor(n * 0.35));
  const lateLen = Math.max(3, Math.floor(n * 0.35));
  const early = series.slice(0, earlyLen);
  const late = series.slice(n - lateLen);
  const earlyAvg = early.reduce((s, r) => s + r.outbound_qty, 0) / early.length;
  const lateAvg = late.reduce((s, r) => s + r.outbound_qty, 0) / late.length;
  const ratio = earlyAvg > 0 ? lateAvg / earlyAvg : null;

  // 초반 활동이 있었는데 후반이 거의 멈춘 형태만 '급감'으로 본다
  const detected =
    ratio !== null && earlyAvg >= 5 && ratio <= 0.22 && lateAvg <= Math.max(3, earlyAvg * 0.25);

  let boundary_op_date: string | null = null;
  if (detected) {
    const threshold = Math.max(2, earlyAvg * 0.35);
    const startScan = Math.max(2, Math.floor(n * 0.2));
    for (let i = startScan; i < n - 2; i += 1) {
      const w =
        (series[i].outbound_qty + series[i + 1].outbound_qty + series[i + 2].outbound_qty) / 3;
      if (w <= threshold) {
        boundary_op_date = series[i].op_date;
        break;
      }
    }
    if (!boundary_op_date) {
      boundary_op_date = series[Math.min(n - 1, Math.floor(n * 0.55))].op_date;
    }
  }

  return {
    detected,
    boundary_op_date,
    early_avg: earlyAvg,
    late_avg: lateAvg,
    late_to_early_ratio: ratio,
  };
}

export function buildCoupangSkuRuleInsight(f: CoupangSkuInsightFacts): RuleBasedCoupangInsight {
  const highlights: RuleInsightBlock[] = [];
  const lines: string[] = [];

  const orderLine =
    [f.order_status, f.order_status_detail].filter(Boolean).join(" / ") || "정보 없음";
  const glQty = f.gl_stock ?? 0;
  const fcQty = f.coupang_current_stock;
  const hasGl = f.gl_mapped && f.gl_stock !== null;

  if (hasGl && fcQty === 0 && f.coupang_is_stockout) {
    lines.push(
      `쿠팡 ${f.center} 재고는 0(품절 표시)이지만, 지엘 창고에는 ${glQty.toLocaleString("ko-KR")}이(가) 있습니다. 물리적 부족이라기보다 채널·노출·발주 상태를 점검할 단계로 볼 수 있습니다.`
    );
  } else if (hasGl && fcQty > 0 && fcQty < 30) {
    lines.push(
      `쿠팡 ${f.center} 재고는 ${fcQty.toLocaleString("ko-KR")}로 낮고, 지엘 창고는 ${glQty.toLocaleString("ko-KR")}입니다. FC 보추 여부와 판매 속도를 함께 보세요.`
    );
  } else if (hasGl) {
    lines.push(
      `지엘 창고 ${glQty.toLocaleString("ko-KR")} · 쿠팡 ${f.center} ${fcQty.toLocaleString("ko-KR")}. 두 채널 수량 차이가 크면 번들·단위(1세트=몇 매) 정의를 한 번 확인하는 것이 좋습니다.`
    );
  } else {
    lines.push(
      `지엘 품목 매핑이 없어 창고 재고는 비교할 수 없습니다. 쿠팡 ${f.center} 재고 ${fcQty.toLocaleString("ko-KR")}, 발주 상태는 「${orderLine}」입니다.`
    );
  }

  if (f.order_status?.includes("일시중단") || f.order_status_detail?.includes("시즌")) {
    lines.push(
      `발주/노출이 「${orderLine}」 쪽으로 분류된 상태입니다. 재입고만으로 노출이 회복되는지는 쿠팡 정책 확인이 필요합니다.`
    );
  }

  if (f.chart_day_count > 0 && (f.total_outbound_in_range > 0 || f.total_inbound_in_range > 0)) {
    const parts: string[] = [];
    if (f.total_inbound_in_range > 0) {
      parts.push(
        `총 입고 ${f.total_inbound_in_range.toLocaleString("ko-KR")}(일평균 약 ${f.avg_daily_inbound.toFixed(1)})`
      );
    }
    if (f.total_outbound_in_range > 0) {
      parts.push(
        `총 출고 ${f.total_outbound_in_range.toLocaleString("ko-KR")}(일평균 약 ${f.avg_daily_outbound.toFixed(1)})`
      );
    }
    lines.push(`선택 기간(${f.chart_day_count}일) ${parts.join(", ")}.`);
  }

  if (f.stockout_streak_days >= 2) {
    lines.push(
      `품절 표시가 연속 ${f.stockout_streak_days}일 이상 이어집니다(저장된 일별 행 기준).`
    );
  }

  if (f.outbound_drop_detected && f.outbound_drop_boundary_date) {
    const ea = f.outbound_early_avg ?? 0;
    const la = f.outbound_late_avg ?? 0;
    lines.push(
      `일별 출고를 보면 ${f.outbound_drop_boundary_date} 전후부터 이전 대비 출고가 크게 줄었습니다(초반 구간 일평균 약 ${ea.toFixed(1)} → 후반 구간 일평균 약 ${la.toFixed(1)}). 시즌 종료·발주 제한·노출 변경·일시중단 등과 겹치는지 쿠팡 화면·정책과 함께 보는 것이 좋습니다.`
    );
  }

  highlights.push({
    title: "핵심 인사이트",
    body: lines.join("\n\n"),
  });

  let pattern = "";
  if (f.chart_day_count === 0) {
    pattern =
      "일별 업로드 데이터가 없어 입·출고 패턴을 계산하지 못했습니다. CSV를 여러 기준일로 쌓으면 추이가 보입니다.";
  } else if (f.outbound_drop_detected) {
    const r = f.outbound_late_to_early_ratio;
    const rText = r !== null ? ` (후반/초반 출고 비율 약 ${(r * 100).toFixed(0)}%)` : "";
    pattern = `막대 그래프 기준으로 앞쪽 구간 대비 뒤쪽 구간에서 출고가 한 번에 꺾인 형태입니다${rText}. 입고·출고 막대와 재고(선)를 함께 보면 FC 보추 타이밍을 짚기 쉽습니다. 발주가능/시즌 분류·노출을 우선 확인하세요.`;
  } else if (f.avg_daily_outbound >= 20) {
    pattern = "기간 대비 출고가 꾸준히 나오는 편입니다. 재고·발주 상태와 맞는지 확인하세요.";
  } else if (f.avg_daily_outbound <= 2 && f.total_outbound_in_range > 0) {
    pattern =
      "출고가 소량에 그친 날이 많아, 이미 시즌 저조 또는 노출 제한 가능성을 열어두는 것이 좋습니다.";
  } else {
    pattern =
      "입·출고는 기간 중 들쭉날칭할 수 있습니다. 말일 재고(선)과 일 입고·일 출고(막대)를 함께 보세요.";
  }

  let asset = "";
  if (hasGl && f.gl_base_cost !== null && f.gl_base_cost > 0) {
    const v = glQty * f.gl_base_cost;
    asset = `지엘 기준 단가(베이스 코스트)로 보면 창고 재고 가치는 대략 ${formatWon(v)} 수준입니다(참고·실제 원가와 다를 수 있음).`;
  } else if (f.purchase_cost !== null && f.purchase_cost > 0 && fcQty >= 0) {
    const v = fcQty * f.purchase_cost;
    asset = `쿠팡 CSV 매입원가 기준으로 FC 재고만 보면 약 ${formatWon(v)} (재고×매입원가, 참고치)입니다.`;
  } else {
    asset =
      "원가 정보가 부족해 금액 추정은 생략했습니다. 매입원가·지엘 base_cost가 쌓이면 보강할 수 있습니다.";
  }

  const setsHint = hasGl && f.gl_stock !== null ? approxGlSets(f.gl_stock, f.bundle_ratio) : null;
  if (setsHint) {
    asset += ` 지엘 수량은 ${setsHint} 근사로 볼 수 있습니다.`;
  }

  const actions: RuleActionRow[] = [];
  actions.push({
    badge: "지금",
    text:
      hasGl && fcQty === 0
        ? "쿠팡 담당 채널에서 품절·발주 상태·시즌 분류(일시중단 등)를 확인하고, 지엘에서 FC 입고 가능 일정을 점검하세요."
        : "당일·주간 FC 재고와 발주가능 상태를 쿠팡 판매자센터와 대조하세요.",
  });
  actions.push({
    badge: "데이터",
    text: "동일 SKU·센터에 대해 기준일이 다른 CSV를 꾸준히 올리면 아래 차트가 길어져 패턴 분석이 쉬워집니다.",
  });
  if (hasGl) {
    actions.push({
      badge: "매핑",
      text: "지엘 품목코드·번들비가 바뀌면 이 화면의 창고 수량 해석도 달라질 수 있으니 item_coupang_mapping을 유지보수하세요.",
    });
  }

  if (f.outbound_drop_detected) {
    actions.push({
      badge: "추세",
      text: `출고 급감 시점(${f.outbound_drop_boundary_date ?? "기간 중"}) 전후로 쿠팡 판매자센터의 발주가능·시즌·노출·프로모션 이력을 스크린샷 또는 메모로 남겨 두면 이후 원인 분석에 도움이 됩니다.`,
    });
  }

  return { highlights, pattern, asset, actions };
}
