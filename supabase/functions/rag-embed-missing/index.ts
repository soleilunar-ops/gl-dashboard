// ============================================================
// 하루루 Edge Function — rag-embed-missing
// 설계 문서: scripts/02_pipeline.md § 4-2
//
// 동작:
//  1. rag_glossary / rag_analysis / rag_events에서 embedding IS NULL row 조회
//  2. 배치(32건 × 최대 4배치 = 128건/회) OpenAI text-embedding-3-small 호출
//  3. row별 embedding UPDATE
//  4. 결과 요약 JSON 반환
//
// 스케줄: pg_cron rag-embed-missing이 10분마다 POST 호출
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const EMBED_MODEL = "text-embedding-3-small";
const BATCH_SIZE = 32;
const MAX_BATCHES_PER_RUN = 4;
const TABLES = ["rag_glossary", "rag_analysis", "rag_events"] as const;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function embedBatch(texts: string[], apiKey: string): Promise<number[][]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI ${res.status}: ${t.slice(0, 400)}`);
  }
  const json = await res.json();
  return json.data.map((d: { embedding: number[] }) => d.embedding);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return Response.json(
        { ok: false, error: "OPENAI_API_KEY Secret 미설정" },
        { status: 503, headers: corsHeaders }
      );
    }

    const report: Record<string, number> = {};

    for (const table of TABLES) {
      let processed = 0;
      for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
        const { data: rows, error } = await supabase
          .from(table)
          .select("id, content")
          .is("embedding", null)
          .limit(BATCH_SIZE);
        if (error) throw new Error(`${table} select: ${error.message}`);
        if (!rows || rows.length === 0) break;

        const embeddings = await embedBatch(
          rows.map((r: { content: string }) => r.content),
          openaiKey
        );

        // rag_events는 updated_at 컬럼 없음 — embedding만 update
        const updatePayload =
          table === "rag_events"
            ? (v: number[]) => ({ embedding: v })
            : (v: number[]) => ({ embedding: v, updated_at: new Date().toISOString() });

        for (let i = 0; i < rows.length; i++) {
          const { error: ue } = await supabase
            .from(table)
            .update(updatePayload(embeddings[i]))
            .eq("id", rows[i].id);
          if (ue) console.error(`${table} update id=${rows[i].id}: ${ue.message}`);
        }
        processed += rows.length;
      }
      report[table] = processed;
    }

    return Response.json({ ok: true, processed: report }, { headers: corsHeaders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: msg }, { status: 500, headers: corsHeaders });
  }
});
