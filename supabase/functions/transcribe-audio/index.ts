// 하루루 STT - OpenAI Whisper
// 사용자 음성 파일은 절대 저장하지 않고 텍스트만 반환.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) throw new Error("OPENAI_API_KEY 미설정");

    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return Response.json(
        { ok: false, error: "file 누락" },
        { status: 400, headers: corsHeaders }
      );
    }

    const whisperForm = new FormData();
    whisperForm.append("file", file);
    whisperForm.append("model", "whisper-1");
    whisperForm.append("language", "ko");
    whisperForm.append("response_format", "json");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: whisperForm,
    });

    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Whisper ${res.status}: ${t.slice(0, 400)}`);
    }

    const { text } = await res.json();
    return Response.json({ ok: true, text }, { headers: corsHeaders });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500, headers: corsHeaders }
    );
  }
});
