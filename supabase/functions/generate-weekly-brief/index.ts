// 06 v0.3 — 주간 리포트 생성.
// 핵심 변경: RAG 검색 제거. 대신 최근 4주 weekly_brief의 insight만 컨텍스트로.
// Gate: 월/금 파라미터 없음. can_generate_weekly_brief() 직접 호출.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  sqlOrdersSection,
  sqlHotpackSeasonSection,
  sqlOffseasonSection,
  sqlInventorySection,
  sqlImportLeadtimeSection,
  sqlMilkrunSection,
  sqlExternalSection,
  sqlNoncomplianceSection,
} from "./sqlSections.ts";
import {
  SYSTEM_PROMPT,
  buildUserMessage,
  callClaudeWithTool,
  sha256,
  type RecentBriefSummary,
} from "./prompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function getLastMonday(): string {
  const now = new Date();
  const dow = now.getUTCDay() === 0 ? 7 : now.getUTCDay();
  const thisMonday = new Date(now);
  thisMonday.setUTCDate(now.getUTCDate() - (dow - 1));
  const lastMonday = new Date(thisMonday);
  lastMonday.setUTCDate(thisMonday.getUTCDate() - 7);
  return lastMonday.toISOString().slice(0, 10);
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function fetchRecentBriefs(
  sb: ReturnType<typeof createClient>
): Promise<RecentBriefSummary[]> {
  const { data } = await sb
    .from("hotpack_llm_reports")
    .select("body_md, generated_at")
    .eq("kind", "weekly_brief")
    .order("generated_at", { ascending: false })
    .limit(4);

  const out: RecentBriefSummary[] = [];
  for (const r of data ?? []) {
    try {
      const body = JSON.parse(r.body_md);
      out.push({
        week_start: body?.metadata?.week_start ?? String(r.generated_at).slice(0, 10),
        headline: body?.insight?.headline ?? "",
        body: body?.insight?.body ?? "",
      });
    } catch {
      /* skip malformed */
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { week_start: requestedWeekStart, force = false } = await req.json().catch(() => ({}));

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY 미설정");

    // 1. Gate (v0.3: 파라미터 없음, 월/금 가드)
    const { data: gate } = await sb.rpc("can_generate_weekly_brief");
    if (!gate?.allowed && !force) {
      return Response.json(
        { ok: false, error: gate?.reason ?? "생성 제한", gate },
        { status: 429, headers: corsHeaders }
      );
    }

    // 2. 대상 주차
    const weekStart = requestedWeekStart ?? getLastMonday();
    const weekEnd = addDays(weekStart, 6);

    // 3. 템플릿 판정
    const { data: template } = await sb.rpc("get_current_report_template");
    const isHotpackSeason = template === "hotpack_season";

    // 4. 7개 섹션 병렬 SQL
    const [orders, sectionTwo, inventory, importLt, milkrun, external, noncompliance] =
      await Promise.all([
        sqlOrdersSection(sb, weekStart, weekEnd),
        isHotpackSeason
          ? sqlHotpackSeasonSection(sb, weekStart, weekEnd)
          : sqlOffseasonSection(sb, weekStart, weekEnd),
        sqlInventorySection(sb, weekStart, weekEnd),
        sqlImportLeadtimeSection(sb, weekStart, weekEnd),
        sqlMilkrunSection(sb, weekStart, weekEnd),
        sqlExternalSection(sb, weekStart, weekEnd),
        sqlNoncomplianceSection(sb, weekStart, weekEnd),
      ]);

    // 5. 최근 4주 weekly_brief 요약 (RAG 아님 · 직접 조회)
    const recentBriefs = await fetchRecentBriefs(sb);

    // 6. prompt_hash로 중복 생성 방지
    const promptHash = await sha256(
      JSON.stringify({
        weekStart,
        weekEnd,
        template,
        orders: orders.rows,
        sectionTwo: sectionTwo.rows,
        inventory: inventory.rows,
        importLt: importLt.rows,
        milkrun: milkrun.rows,
        external: external.rows,
        noncompliance: noncompliance.rows,
      })
    );
    const { data: cached } = await sb
      .from("hotpack_llm_reports")
      .select("*")
      .eq("kind", "weekly_brief")
      .eq("prompt_hash", promptHash)
      .maybeSingle();
    if (cached && !force) {
      return Response.json(
        { ok: true, cached: true, report: cached, gate },
        { headers: corsHeaders }
      );
    }

    // 7. Claude Sonnet 4.6 호출
    const userMessage = buildUserMessage({
      weekStart,
      weekEnd,
      template: isHotpackSeason ? "hotpack_season" : "off_season",
      sections: { orders, sectionTwo, inventory, importLt, milkrun, external, noncompliance },
      recentBriefs,
    });

    const model = "claude-sonnet-4-6";
    // Tool Use로 구조화 출력 강제 → JSON syntax 에러 원천 차단
    const parsed = await callClaudeWithTool({
      apiKey: anthropicKey,
      model,
      systemPrompt: SYSTEM_PROMPT,
      userMessage,
      maxTokens: 8000,
    });

    // 8. 저장
    const { data: seasonRow } = await sb
      .from("season_config")
      .select("season")
      .eq("is_closed", false)
      .maybeSingle();
    const season = seasonRow?.season ?? `비시즌-${new Date().getFullYear()}`;

    const { data: inserted, error: ie } = await sb
      .from("hotpack_llm_reports")
      .insert({
        season,
        kind: "weekly_brief",
        body_md: JSON.stringify(parsed),
        prompt_hash: promptHash,
        model,
      })
      .select()
      .single();
    if (ie) throw new Error(`insert: ${ie.message}`);

    // 9. RAG chunks 적재 (9개)
    const { error: ce } = await sb.rpc("upsert_weekly_brief_chunks", {
      p_report_id: inserted.id,
    });
    if (ce) console.error("chunk upsert:", ce.message);

    return Response.json(
      { ok: true, cached: false, report: inserted, parsed, gate },
      { headers: corsHeaders }
    );
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500, headers: corsHeaders }
    );
  }
});
