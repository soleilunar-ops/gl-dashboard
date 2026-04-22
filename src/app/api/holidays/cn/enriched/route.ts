// 변경 이유: Nager 공휴일에 Claude 검증/보완을 결합한 중국 연휴 데이터를 제공합니다.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBuiltinCnHolidayPeriodsForYear } from "@/lib/cn-official-holidays-builtin";
import type { CnHolidayPeriod } from "@/lib/cn-holiday-period";
import { resolveAnthropicApiKey } from "@/lib/logistics/resolveLlmApiKeys";

type NagerHolidayRow = {
  date: string;
  localName: string;
  name: string;
  countryCode: string;
  fixed: boolean;
  global: boolean;
  counties: string[] | null;
  launchYear: number | null;
  types: string[];
};

type EnrichedHolidayPeriod = {
  labelKo: string;
  startDate: string;
  endDate: string;
  dayCount: number;
  source: "nager" | "nager+claude" | "cn-builtin";
  substituteWorkdays: string[];
  orderCutoffRecommended: string | null;
  note: string | null;
};

type ClaudeSuggestion = {
  labelKo: string;
  startDate: string;
  endDate: string;
  substituteWorkdays?: string[];
  orderCutoffRecommended?: string | null;
  note?: string | null;
};

type ClaudePayload = {
  year: number;
  periods: ClaudeSuggestion[];
};

const TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<
  number,
  {
    expires: number;
    rows: EnrichedHolidayPeriod[];
    verifier: string;
    verifyError: string | null;
  }
>();

function isYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseYearParam(url: URL): number {
  const raw = url.searchParams.get("year");
  const nowYear = new Date().getFullYear();
  if (!raw) return nowYear;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 2020 || n > nowYear + 2) return nowYear;
  return n;
}

function dayCountInclusive(startYmd: string, endYmd: string): number {
  const start = new Date(`${startYmd}T12:00:00Z`).getTime();
  const end = new Date(`${endYmd}T12:00:00Z`).getTime();
  return Math.max(1, Math.floor((end - start) / 86400000) + 1);
}

function addDays(ymd: string, days: number): string {
  const date = new Date(`${ymd}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function toKoLabel(name: string, localName: string): string {
  const key = `${name} ${localName}`.toLowerCase();
  if (key.includes("new year")) return "신정";
  if (key.includes("spring festival") || key.includes("chinese new year")) return "춘절";
  if (key.includes("qingming")) return "청명절";
  if (key.includes("labour") || key.includes("labor")) return "노동절";
  if (key.includes("dragon boat")) return "단오절";
  if (key.includes("mid-autumn")) return "중추절";
  if (key.includes("national day")) return "국경절";
  return localName?.trim() || name;
}

function buildNagerBase(rows: NagerHolidayRow[]): EnrichedHolidayPeriod[] {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const grouped = new Map<string, { start: string; end: string }>();

  for (const row of sorted) {
    const labelKo = toKoLabel(row.name, row.localName);
    const hit = grouped.get(labelKo);
    if (!hit) {
      grouped.set(labelKo, { start: row.date, end: row.date });
      continue;
    }
    if (row.date < hit.start) hit.start = row.date;
    if (row.date > hit.end) hit.end = row.date;
  }

  return Array.from(grouped.entries())
    .map(([labelKo, range]) => {
      const dayCount = dayCountInclusive(range.start, range.end);
      return {
        labelKo,
        startDate: range.start,
        endDate: range.end,
        dayCount,
        source: "nager" as const,
        substituteWorkdays: [],
        orderCutoffRecommended: addDays(range.start, -14),
        note: "Nager 기본 데이터",
      };
    })
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function mergeByClaude(
  base: EnrichedHolidayPeriod[],
  suggestions: ClaudeSuggestion[] | undefined
): EnrichedHolidayPeriod[] {
  if (!suggestions || suggestions.length === 0) return base;

  const byLabel = new Map(base.map((item) => [item.labelKo, item]));
  const out: EnrichedHolidayPeriod[] = [];

  for (const item of base) {
    const match = suggestions.find((s) => s.labelKo === item.labelKo);
    if (!match || !isYmd(match.startDate) || !isYmd(match.endDate)) {
      out.push(item);
      continue;
    }
    const startDate = match.startDate;
    const endDate = match.endDate >= startDate ? match.endDate : startDate;
    out.push({
      ...item,
      startDate,
      endDate,
      dayCount: dayCountInclusive(startDate, endDate),
      source: "nager+claude",
      substituteWorkdays: (match.substituteWorkdays ?? []).filter(isYmd),
      orderCutoffRecommended:
        typeof match.orderCutoffRecommended === "string" && isYmd(match.orderCutoffRecommended)
          ? match.orderCutoffRecommended
          : item.orderCutoffRecommended,
      note: match.note?.trim() || item.note,
    });
  }

  for (const suggestion of suggestions) {
    if (!byLabel.has(suggestion.labelKo)) {
      if (!isYmd(suggestion.startDate) || !isYmd(suggestion.endDate)) continue;
      const endDate =
        suggestion.endDate >= suggestion.startDate ? suggestion.endDate : suggestion.startDate;
      out.push({
        labelKo: suggestion.labelKo,
        startDate: suggestion.startDate,
        endDate,
        dayCount: dayCountInclusive(suggestion.startDate, endDate),
        source: "nager+claude",
        substituteWorkdays: (suggestion.substituteWorkdays ?? []).filter(isYmd),
        orderCutoffRecommended:
          typeof suggestion.orderCutoffRecommended === "string" &&
          isYmd(suggestion.orderCutoffRecommended)
            ? suggestion.orderCutoffRecommended
            : addDays(suggestion.startDate, -14),
        note: suggestion.note?.trim() || "Claude 보완 데이터",
      });
    }
  }

  return out.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/** Claude 미적용 시 Nager 단일일 대신 국무원 기준 내장표로 표시 */
function builtinPeriodsToEnriched(rows: CnHolidayPeriod[]): EnrichedHolidayPeriod[] {
  return rows
    .map((p) => ({
      labelKo: p.labelKo,
      startDate: p.startDate,
      endDate: p.endDate,
      dayCount: p.dayCount,
      source: "cn-builtin" as const,
      substituteWorkdays: [...p.bridgeDays],
      orderCutoffRecommended: addDays(p.startDate, -14),
      note: "국무원 일정 기반 내장 데이터(AI 검증 없음)",
    }))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/** 문자열 리터럴 안의 중괄호는 무시하고 최상위 JSON 객체 한 덩어리만 잘라냅니다. */
function sliceBalancedObjectJson(source: string, start: number): string | null {
  if (source[start] !== "{") return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < source.length; i += 1) {
    const c = source[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

function iterJsonObjectCandidates(text: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== "{") continue;
    const slice = sliceBalancedObjectJson(text, i);
    if (slice) out.push(slice);
  }
  return out;
}

function tryParseClaudePayload(raw: string): ClaudePayload | null {
  const trimmed = raw.trim();
  const direct = safeParsePayload(trimmed);
  if (direct) return direct;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const parsed = safeParsePayload(fenced[1].trim());
    if (parsed) return parsed;
  }

  // 여러 JSON 객체가 연속이거나 설명문이 섞이면 전역 탐욕 매칭이 깨짐 → 균형 중괄호 후보만 시도
  for (const candidate of iterJsonObjectCandidates(trimmed)) {
    const parsed = safeParsePayload(candidate);
    if (parsed) return parsed;
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeToolInputToPayload(input: unknown): ClaudePayload | null {
  let raw: unknown = input;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (!isRecord(raw)) return null;
  if (!Array.isArray(raw.periods)) return null;
  const year = typeof raw.year === "number" && Number.isFinite(raw.year) ? raw.year : 0;
  return { year, periods: raw.periods as ClaudeSuggestion[] };
}

/** 응답 JSON 어디에 있든 submit_holiday_corrections tool_use.input을 수집합니다(중첩 구조 대비). */
function collectSubmitHolidayPayloads(root: unknown): ClaudePayload[] {
  const out: ClaudePayload[] = [];

  const visit = (node: unknown): void => {
    if (node === null || node === undefined) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (!isRecord(node)) return;

    if (node.type === "tool_use" && node.name === "submit_holiday_corrections") {
      const payload = normalizeToolInputToPayload(node.input);
      if (payload) out.push(payload);
    }

    for (const value of Object.values(node)) visit(value);
  };

  visit(root);
  return out;
}

function safeParsePayload(text: string): ClaudePayload | null {
  try {
    const parsed = JSON.parse(text) as ClaudePayload;
    if (!Array.isArray(parsed.periods)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function fetchNager(year: number): Promise<NagerHolidayRow[]> {
  const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/CN`, {
    method: "GET",
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    throw new Error(`Nager API 오류 (${res.status})`);
  }
  const rows = (await res.json()) as NagerHolidayRow[];
  return Array.isArray(rows) ? rows : [];
}

async function callClaudeWebVerify(
  apiKey: string,
  year: number,
  base: EnrichedHolidayPeriod[]
): Promise<{ payload: ClaudePayload | null; error: string | null }> {
  const system = [
    "당신은 중국 공휴일 검증 담당자입니다.",
    "반드시 웹 검색 결과를 바탕으로만 보정하세요.",
    "출력은 반드시 JSON 한 개만 반환하고, 날짜 형식은 YYYY-MM-DD만 사용합니다.",
    "substituteWorkdays는 대체 근무일(출근일)만 넣습니다.",
    "orderCutoffRecommended는 일반 제조 발주 기준 권장 마감일로, 연휴 시작 10~18일 전 사이에서 현실적으로 제안합니다.",
  ].join(" ");

  const userPrompt = [
    `${year}년 중국 법정 공휴일 데이터를 검증/보완하세요.`,
    "초기 데이터:",
    JSON.stringify(base, null, 2),
    "요구사항:",
    "- 실제 연휴 기간(연속 휴무 구간) 보정",
    "- 대체 근무일(substituteWorkdays) 추가",
    "- 발주 마감 권장일(orderCutoffRecommended) 제안",
    "- 각 항목 note에 근거 요약(짧게) 작성",
    "- 마지막 출력은 반드시 submit_holiday_corrections 도구 호출로 제출",
  ].join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "web-search-2025-03-05",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_HOLIDAY_MODEL?.trim() || "claude-sonnet-4-5",
      // 웹 검색 + tool 입력 JSON이 길어질 수 있어 여유를 둡니다.
      max_tokens: 4096,
      system,
      tools: [
        { type: "web_search_20250305", name: "web_search", max_uses: 6 },
        {
          name: "submit_holiday_corrections",
          description: "검증/보완된 중국 공휴일 결과를 최종 제출합니다.",
          input_schema: {
            type: "object",
            properties: {
              year: { type: "integer" },
              periods: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    labelKo: { type: "string" },
                    startDate: { type: "string" },
                    endDate: { type: "string" },
                    substituteWorkdays: { type: "array", items: { type: "string" } },
                    orderCutoffRecommended: { type: ["string", "null"] },
                    note: { type: ["string", "null"] },
                  },
                  required: ["labelKo", "startDate", "endDate"],
                },
              },
            },
            required: ["year", "periods"],
          },
        },
      ],
      messages: [{ role: "user", content: userPrompt }],
      tool_choice: { type: "auto" },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return { payload: null, error: `Claude API 오류 (${res.status}): ${text.slice(0, 180)}` };
  }
  const json = (await res.json()) as Record<string, unknown>;

  const fromTools = collectSubmitHolidayPayloads(json);
  const toolPayload = fromTools.find((p) => p.periods.length > 0) ?? fromTools[0] ?? null;
  if (toolPayload) {
    return { payload: toolPayload, error: null };
  }

  const content = json.content;
  const contentBlocks = Array.isArray(content) ? content : [];
  const texts = contentBlocks
    .filter(
      (c): c is { type: string; text: string } => c.type === "text" && typeof c.text === "string"
    )
    .map((c) => c.text.trim())
    .filter((v) => v.length > 0);

  if (texts.length === 0) {
    return { payload: null, error: "Claude 응답 본문이 비어 있습니다." };
  }

  // 툴 사용 응답은 설명 텍스트 + JSON이 섞일 수 있어 마지막 텍스트부터 역순 탐색
  const candidates = [...texts].reverse();
  for (const candidate of candidates) {
    const payload = tryParseClaudePayload(candidate);
    if (payload) return { payload, error: null };
  }

  return { payload: null, error: "Claude JSON 파싱에 실패했습니다." };
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
  }

  const year = parseYearParam(new URL(request.url));
  const cached = cache.get(year);
  if (cached && cached.expires > Date.now()) {
    return NextResponse.json({
      year,
      verifier: cached.verifier,
      verifyError: cached.verifyError,
      periods: cached.rows,
      generatedAt: new Date().toISOString(),
    });
  }

  try {
    const nagerRows = await fetchNager(year);
    const base = buildNagerBase(nagerRows);
    const anthropicKey = resolveAnthropicApiKey();

    let periods = base;
    let verifier = "nager-only";
    let verifyError: string | null = null;
    if (anthropicKey) {
      const verified = await callClaudeWebVerify(anthropicKey, year, base);
      verifyError = verified.error;
      if (verified.payload?.periods?.length) {
        periods = mergeByClaude(base, verified.payload.periods);
        verifier = "nager+claude-web-search";
        verifyError = null;
      }
    } else {
      verifyError = "ANTHROPIC_API_KEY가 없어 AI 검증을 건너뛰었습니다.";
    }

    // Claude가 적용되지 않았고 해당 연도 내장표가 있으면 Nager 대신 내장 데이터 사용
    if (verifier !== "nager+claude-web-search") {
      const builtinRows = getBuiltinCnHolidayPeriodsForYear(year);
      const builtinEnriched = builtinPeriodsToEnriched(builtinRows);
      if (builtinEnriched.length > 0) {
        periods = builtinEnriched;
        verifier = "cn-builtin";
      }
    }

    cache.set(year, { expires: Date.now() + TTL_MS, rows: periods, verifier, verifyError });
    return NextResponse.json({
      year,
      verifier,
      verifyError,
      periods,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "중국 연휴 데이터를 불러오지 못했습니다.";
    return NextResponse.json({ message }, { status: 502 });
  }
}
