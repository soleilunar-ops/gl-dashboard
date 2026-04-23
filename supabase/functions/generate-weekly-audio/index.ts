// 하루루 주간 리포트 TTS - Supertone
// v10: C + B — 헤드라인 제외한 body + alerts + next_week 를 280자 청크로 분할,
//       병렬 생성 후 배열 반환. 프론트가 순차 재생.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_TTS_CHARS = 280; // Supertone 300자 하드리밋 안전 마진
const MAX_CHUNKS = 8; // 과도한 비용 방지
const DEFAULT_VOICE_ID = "e5f6fb1a53d0add87afb4f"; // Agatha

function stripMarkdownForTts(input: string): string {
  return input
    .replace(/\[ref:[^\]]+\]/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\|/g, ", ")
    .replace(/-{3,}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// 문장 경계로 자른 뒤 탐욕적으로 packing. 한 문장이 MAX를 초과하면 쉼표로 재분할, 그래도 넘으면 하드컷.
function splitIntoChunks(text: string, maxChars: number): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  const sentences = clean.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let buf = "";

  const pushBuf = () => {
    if (buf.trim()) chunks.push(buf.trim());
    buf = "";
  };

  for (const s of sentences) {
    const candidate = buf ? `${buf} ${s}` : s;
    if (candidate.length <= maxChars) {
      buf = candidate;
      continue;
    }
    pushBuf();

    if (s.length <= maxChars) {
      buf = s;
      continue;
    }

    // 한 문장이 너무 길면 쉼표로 쪼개기
    const parts = s.split(/(?<=,)\s+/);
    let sub = "";
    for (const p of parts) {
      const subCand = sub ? `${sub} ${p}` : p;
      if (subCand.length <= maxChars) {
        sub = subCand;
      } else {
        if (sub.trim()) chunks.push(sub.trim());
        if (p.length <= maxChars) {
          sub = p;
        } else {
          // 하드 슬라이스
          let rem = p;
          while (rem.length > maxChars) {
            chunks.push(rem.slice(0, maxChars));
            rem = rem.slice(maxChars);
          }
          sub = rem;
        }
      }
    }
    if (sub.trim()) buf = sub;
  }
  pushBuf();
  return chunks.slice(0, MAX_CHUNKS);
}

function buildInsightScript(insight: Record<string, unknown>): string {
  const body = stripMarkdownForTts(String(insight?.body ?? ""));
  const alertsArr = Array.isArray(insight?.alerts)
    ? (insight.alerts as unknown[]).map((x) => stripMarkdownForTts(String(x))).filter(Boolean)
    : [];
  const nextArr = Array.isArray(insight?.next_week)
    ? (insight.next_week as unknown[]).map((x) => stripMarkdownForTts(String(x))).filter(Boolean)
    : [];

  let script = body;
  if (alertsArr.length) {
    script += ` 주의사항 ${alertsArr.length}가지입니다. `;
    script += alertsArr.map((a, i) => `${i + 1}, ${a}`).join(". ") + ".";
  }
  if (nextArr.length) {
    script += ` 차주 주목 포인트 ${nextArr.length}가지입니다. `;
    script += nextArr.map((n, i) => `${i + 1}, ${n}`).join(". ") + ".";
  }
  return script.trim();
}

async function synthesizeChunk(opts: {
  supertoneKey: string;
  voiceId: string;
  text: string;
}): Promise<Blob> {
  const res = await fetch(`https://supertoneapi.com/v1/text-to-speech/${opts.voiceId}`, {
    method: "POST",
    headers: {
      "x-sup-api-key": opts.supertoneKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      text: opts.text,
      language: "ko",
      style: "neutral",
      model: "sona_speech_2",
      voice_settings: { pitch_shift: 0, pitch_variance: 1, speed: 1.0 },
      output_format: "wav",
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Supertone ${res.status}: ${t.slice(0, 300)}`);
  }
  return await res.blob();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { report_id, section = "insight" } = await req.json();

    if (section !== "insight") {
      return Response.json(
        {
          ok: false,
          error: "현재는 인사이트 요약만 음성 재생을 지원합니다.",
        },
        { status: 400, headers: corsHeaders }
      );
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const supertoneKey = Deno.env.get("SUPERTONE_API_KEY");
    if (!supertoneKey) throw new Error("SUPERTONE_API_KEY 미설정");
    const voiceId = Deno.env.get("SUPERTONE_VOICE_ID") ?? DEFAULT_VOICE_ID;

    const { data: report, error: re } = await sb
      .from("hotpack_llm_reports")
      .select("id, body_md")
      .eq("id", report_id)
      .eq("kind", "weekly_brief")
      .single();
    if (re || !report) throw new Error("리포트를 찾지 못했어요");

    const body = JSON.parse(report.body_md);
    const script = buildInsightScript(body.insight ?? {});
    if (script.length < 10) {
      return Response.json(
        { ok: false, error: "음성 변환할 내용 없음" },
        { status: 400, headers: corsHeaders }
      );
    }

    const chunkTexts = splitIntoChunks(script, MAX_TTS_CHARS);
    if (!chunkTexts.length) {
      return Response.json(
        { ok: false, error: "청크 분할 실패" },
        { status: 500, headers: corsHeaders }
      );
    }

    const results = await Promise.all(
      chunkTexts.map(async (text, i) => {
        const blob = await synthesizeChunk({ supertoneKey, voiceId, text });
        const path = `weekly-brief/${report_id}/${section}_${i}.wav`;
        const { error: upErr } = await sb.storage
          .from("haruru-audio")
          .upload(path, blob, { contentType: "audio/wav", upsert: true });
        if (upErr) throw new Error(`storage(${i}): ${upErr.message}`);
        const { data: pub } = sb.storage.from("haruru-audio").getPublicUrl(path);
        return { order: i, url: pub.publicUrl, chars: text.length };
      })
    );

    return Response.json(
      {
        ok: true,
        section,
        chunks: results,
        total_chunks: results.length,
        total_chars: script.length,
      },
      { headers: corsHeaders }
    );
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500, headers: corsHeaders }
    );
  }
});
