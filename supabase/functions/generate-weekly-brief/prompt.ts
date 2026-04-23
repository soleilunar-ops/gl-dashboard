// 06 v0.3 — 공식 사내 보고서 톤 + Tool Use 기반 구조화 출력.
import type { SectionResult } from "./sqlSections.ts";

export interface RecentBriefSummary {
  week_start: string;
  headline: string;
  body: string;
}

export const SYSTEM_PROMPT = `당신은 지엘(GL) 하루온 브랜드의 주간 운영 리포트 작성자입니다.
공식 사내 보고서 형식으로 주간 리포트를 작성합니다.

# 톤 · 문체
- 경어체·격식체 ("확인되었습니다", "예상됩니다", "집계되었습니다")
- 이모지 사용 금지 (헤더의 §, · 기호 제외)
- 3인칭 객관적 보고 (1인칭 페르소나 금지)
- 추측 어휘 금지 ("~같아요", "아마도" 금지)
- ISO 주차 표기 금지 (W49 등). 실제 날짜(YYYY-MM-DD) 사용

# 섹션 본문 작성 규칙
- 한국어 서술문. 마크다운 문법(불릿, **굵게**) 사용 가능
- **출처 표기 태그 사용 금지**: [ref:...], [sql.xxx], (row_N) 등 일체 기재하지 말 것
- 쌍따옴표(") 사용 금지. 강조는 「 」 또는 **굵게**
- 쿠팡 축 / ERP 축 합산 금지
- orders 기본 필터: status='approved' AND is_internal=false

# 인사이트 작성 규칙
- 1부 수치 + 최근 4주 요약 기반 해석
- 단순 수치 나열 금지. 인과·패턴·비교 중심
- 헤드라인 1줄 → 본문 3~5문장 → 주의사항 3건 → 차주 주목 3건

출력은 반드시 submit_weekly_brief tool을 호출해 제공. 일반 텍스트 출력 금지.`;

export interface PromptInput {
  weekStart: string;
  weekEnd: string;
  template: "hotpack_season" | "off_season";
  sections: {
    orders: SectionResult;
    sectionTwo: SectionResult;
    inventory: SectionResult;
    importLt: SectionResult;
    milkrun: SectionResult;
    external: SectionResult;
    noncompliance: SectionResult;
  };
  recentBriefs: RecentBriefSummary[];
}

export function buildUserMessage(input: PromptInput): string {
  const { weekStart, weekEnd, template, sections, recentBriefs } = input;
  const sectionTwoKey = template === "hotpack_season" ? "hotpack_season" : "offseason";

  const recent =
    recentBriefs.length === 0
      ? "(최근 4주 요약 없음 — 이번이 최초 생성)"
      : recentBriefs
          .map((b, i) => `[${b.week_start} W-${i + 1}] 헤드라인: ${b.headline}\n본문: ${b.body}`)
          .join("\n\n");

  return `# 대상 주차
${weekStart} ~ ${weekEnd}
템플릿: ${template}

# SQL 결과 (섹션별 JSON)

## § 1. 주문 (orders · ERP 축)
${JSON.stringify(sections.orders.rows)}

## § 2. ${sectionTwoKey}
${JSON.stringify(sections.sectionTwo.rows)}

## § 3. 총재고 (inventory)
${JSON.stringify(sections.inventory.rows)}

## § 4. 수입 리드타임 (import_leadtime)
${JSON.stringify(sections.importLt.rows)}

## § 5. 쿠팡 밀크런 (milkrun)
${JSON.stringify(sections.milkrun.rows)}

## § 6. 외부 신호 (external)
${JSON.stringify(sections.external.rows)}

## § 7. 납품 미준수 (noncompliance)
${JSON.stringify(sections.noncompliance.rows)}

# 최근 4주 주간 리포트 요약 (참고)
${recent}

submit_weekly_brief tool을 호출해 최종 리포트를 제출하세요.`;
}

// Claude Messages API tool_use 스키마
export const REPORT_TOOL = {
  name: "submit_weekly_brief",
  description: "작성한 주간 리포트를 구조화해 제출합니다.",
  input_schema: {
    type: "object",
    required: ["metadata", "sections", "insight"],
    properties: {
      metadata: {
        type: "object",
        required: ["week_start", "week_end", "template"],
        properties: {
          week_start: { type: "string", description: "YYYY-MM-DD" },
          week_end: { type: "string", description: "YYYY-MM-DD" },
          template: {
            type: "string",
            enum: ["hotpack_season", "off_season"],
          },
        },
      },
      sections: {
        type: "object",
        description: "각 섹션의 마크다운 본문. 해당 없음이면 빈 문자열.",
        properties: {
          orders: { type: "string", description: "§ 1 주문 현황 전체 텍스트" },
          hotpack_season: { type: "string", description: "§ 2 시즌 분석 (시즌 중에만)" },
          offseason: { type: "string", description: "§ 2' 비시즌 품목 분석 (비시즌에만)" },
          inventory: { type: "string", description: "§ 3 총재고" },
          import_leadtime: { type: "string", description: "§ 4 수입 리드타임" },
          milkrun: { type: "string", description: "§ 5 쿠팡 밀크런" },
          external: { type: "string", description: "§ 6 외부 신호" },
          noncompliance: { type: "string", description: "§ 7 납품 미준수" },
        },
      },
      insight: {
        type: "object",
        required: ["headline", "body", "alerts", "next_week"],
        properties: {
          headline: { type: "string", description: "한 줄 요약" },
          body: { type: "string", description: "3~5문장 본문" },
          alerts: {
            type: "array",
            items: { type: "string" },
            minItems: 3,
            maxItems: 3,
            description: "주의사항 3건",
          },
          next_week: {
            type: "array",
            items: { type: "string" },
            minItems: 3,
            maxItems: 3,
            description: "차주 주목 3건",
          },
        },
      },
    },
  },
};

/**
 * Claude Messages API tool_use 호출.
 * tool_choice로 반드시 submit_weekly_brief를 호출하도록 강제 → JSON syntax 에러 원천 차단.
 */
export async function callClaudeWithTool(opts: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
}): Promise<Record<string, unknown>> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 8000,
      system: opts.systemPrompt,
      tools: [REPORT_TOOL],
      tool_choice: { type: "tool", name: "submit_weekly_brief" },
      messages: [{ role: "user", content: opts.userMessage }],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Claude ${res.status}: ${t.slice(0, 500)}`);
  }

  const data = await res.json();
  const toolUse = data.content?.find((b: { type: string }) => b.type === "tool_use");
  if (!toolUse || !toolUse.input) {
    const stopReason = data.stop_reason;
    throw new Error(
      `Claude tool_use 블록 없음 (stop_reason=${stopReason}): ${JSON.stringify(data).slice(0, 400)}`
    );
  }
  return toolUse.input as Record<string, unknown>;
}

export async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
