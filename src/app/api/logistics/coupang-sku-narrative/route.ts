// 쿠팡 SKU 분석 팩트(JSON)를 받아 LLM으로 한국어 서술만 보강 (수치는 팩트에만 의존)
import { createClient } from "@/lib/supabase/server";
import type { CoupangSkuInsightFacts } from "@/lib/logistics/coupangSkuInsightRules";
import { resolveAnthropicApiKey, resolveOpenAiApiKey } from "@/lib/logistics/resolveLlmApiKeys";
import { stripAiMarkdownNoise } from "@/lib/logistics/stripAiMarkdownNoise";
import { NextResponse } from "next/server";

function isFactsShape(x: unknown): x is CoupangSkuInsightFacts {
  if (x === null || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.sku_id === "string" && typeof o.center === "string";
}

async function callAnthropic(apiKey: string, system: string, userText: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      // 3.5 Haiku 스냅샷은 API에서 제거되어 404 — Haiku 4.5 별칭(문서: platform.claude.com models overview)
      model: process.env.ANTHROPIC_ANALYSIS_MODEL?.trim() || "claude-haiku-4-5",
      max_tokens: 1200,
      system,
      messages: [{ role: "user", content: userText }],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Anthropic ${res.status}: ${t.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    content?: { type: string; text?: string }[];
  };
  const block = json.content?.find((c) => c.type === "text");
  const text = block?.text?.trim();
  if (!text) throw new Error("Anthropic 응답 본문 없음");
  return text;
}

async function callOpenAI(apiKey: string, system: string, userText: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userText },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI ${res.status}: ${t.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("OpenAI 응답 본문 없음");
  return text;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON 파싱 실패" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || !("facts" in body)) {
    return NextResponse.json({ error: "facts 필드가 필요합니다." }, { status: 400 });
  }
  const facts = (body as { facts: unknown }).facts;
  if (!isFactsShape(facts)) {
    return NextResponse.json({ error: "facts 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const anthropicKey = resolveAnthropicApiKey();
  const openaiKey = resolveOpenAiApiKey();
  const hasAnthropic = Boolean(anthropicKey);
  const hasOpenai = Boolean(openaiKey);
  if (!hasAnthropic && !hasOpenai) {
    return NextResponse.json(
      {
        error:
          "LLM API 키가 없습니다. final_key(Claude) · final_api_key(OpenAI) 중 하나를 .env.local에 넣고, 키=값 형식(콜론 금지)인지 확인한 뒤 dev 서버를 재시작하세요.",
      },
      { status: 503 }
    );
  }

  const system = [
    "당신은 국내 이커머스 물류·재고 분석가입니다.",
    "반드시 사용자가 제공한 JSON 안의 숫자·날짜만 인용하고, 새로운 수치나 거래를 지어내지 마세요.",
    "한국어로 3~5문단: (1) 쿠팡 vs 지엘 재고 관계 (2) 발주·품절 상태 해석 (3) JSON에 있는 기간 총·일평균 입고와 출고를 함께 언급하고, 입고 대비 출고 흐름이 FC 재고(쿠팡) 추이와 어떻게 맞는지 설명할 것. 팩트에 출고 급감이 표시되면 그 시점과 가능한 원인 (4) 실행 가능한 권장 2~3가지.",
    "과장 금지, 모르면 '데이터 부족'이라고 짧게 말하세요.",
    "서식 규칙(필수): Markdown을 쓰지 마세요. ** # ## ` 백틱 링크문법 금지. 숫자·강조는 그냥 일반 글자로만 쓰세요(예: 1,411개).",
    "구역 구분은 빈 줄 한 줄과, 소제목은 「1. 쿠팡 vs 지엘」처럼 숫자·마침표 뒤 한글만 사용하세요.",
    "JSON 필드명·콜론 표기 금지: coupang_is_stockout, order_status, outbound_drop_detected 같은 영문 키나 (키: 값) 형태를 본문에 쓰지 마세요. 품절 여부·발주 상태·출고 급감 여부는 한글 문장으로만 설명하세요.",
    "이커머스 채널명은 반드시 '쿠팡'으로만 표기하세요(오타 '쿠팑' 금지).",
    "문서 제목·첫머리에 '재고·판매 현황'처럼 중간점(·)으로 '판매'를 끼워 넣지 마세요. 'OOO 재고 현황 분석' 형태만 사용하세요.",
  ].join(" ");

  const userText = [
    "아래 JSON은 대시보드가 계산한 팩트입니다. 이를 바탕으로 경영진이 읽기 쉬운 요약을 작성하세요.",
    "",
    JSON.stringify(facts, null, 2),
  ].join("\n");

  const prefer = process.env.COUPANG_SKU_NARRATIVE_PROVIDER?.trim().toLowerCase();
  const openaiFirst = prefer === "openai" || prefer === "gpt";

  try {
    let narrative: string;
    let provider: "anthropic" | "openai";

    if (openaiFirst && openaiKey) {
      narrative = await callOpenAI(openaiKey, system, userText);
      provider = "openai";
    } else if (anthropicKey) {
      narrative = await callAnthropic(anthropicKey, system, userText);
      provider = "anthropic";
    } else if (openaiKey) {
      narrative = await callOpenAI(openaiKey, system, userText);
      provider = "openai";
    } else {
      return NextResponse.json(
        {
          error: "LLM API 키가 없습니다. final_key(Claude) · final_api_key(OpenAI)를 확인하세요.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      narrative: stripAiMarkdownNoise(narrative),
      provider,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "LLM 호출 실패";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
