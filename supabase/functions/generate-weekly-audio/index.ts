// 하루루 주간 리포트 TTS - Supertone
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// 환경변수로 voice_id 주입 — 발급 전에는 Supertone 기본 voice 사용
const DEFAULT_VOICE_ID = "supertone:ko-female-bright";

function stripMarkdownForTts(input: string): string {
  return input
    .replace(/\[ref:[^\]]+\]/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\|/g, ", ")
    .replace(/-{3,}/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { report_id, section = "insight" } = await req.json();

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

    let text: string;
    if (section === "insight") {
      const i = body.insight ?? {};
      const alerts = Array.isArray(i.alerts) ? i.alerts : [];
      const nextWeek = Array.isArray(i.next_week) ? i.next_week : [];
      text =
        `이번 주 인사이트입니다. ${i.headline ?? ""}. ${i.body ?? ""}. ` +
        (alerts.length ? `주의할 점이 ${alerts.length}가지 있습니다. ${alerts.join(". ")}. ` : "") +
        (nextWeek.length ? `다음 주 주목할 부분은 ${nextWeek.join(", ")}입니다.` : "");
    } else if (section === "all") {
      const sections = Object.values(body.sections ?? {}).filter(
        (v): v is string => typeof v === "string"
      );
      const i = body.insight ?? {};
      text =
        sections.join("\n\n") + "\n\n" + `이번 주 인사이트. ${i.headline ?? ""}. ${i.body ?? ""}`;
    } else {
      text = body.sections?.[section] ?? "";
    }
    text = stripMarkdownForTts(text);

    if (text.length < 10) {
      return Response.json(
        { ok: false, error: "음성 변환할 내용 없음" },
        { status: 400, headers: corsHeaders }
      );
    }

    const supertoneRes = await fetch(`https://supertoneapi.com/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "x-sup-api-key": supertoneKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        text,
        language: "ko",
        style: "neutral",
        model: "sona_speech_1",
        voice_settings: { pitch_shift: 0, pitch_variance: 1, speed: 1.0 },
        output_format: "wav",
      }),
    });

    if (!supertoneRes.ok) {
      const t = await supertoneRes.text();
      throw new Error(`Supertone ${supertoneRes.status}: ${t.slice(0, 400)}`);
    }

    const audioBlob = await supertoneRes.blob();
    const path = `weekly-brief/${report_id}/${section}.wav`;
    const { error: upErr } = await sb.storage
      .from("haruru-audio")
      .upload(path, audioBlob, { contentType: "audio/wav", upsert: true });
    if (upErr) throw new Error(`storage: ${upErr.message}`);

    const { data: publicUrl } = sb.storage.from("haruru-audio").getPublicUrl(path);

    return Response.json(
      {
        ok: true,
        audio_url: publicUrl.publicUrl,
        section,
        text_length: text.length,
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
