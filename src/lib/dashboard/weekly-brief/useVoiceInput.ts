"use client";

// 07 v0.2 — STT 녹음 훅. 녹음 종료 후 Blob 즉시 해제.
import { useRef, useState } from "react";
import { toast } from "sonner";

export function useVoiceInput() {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const start = async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
      return true;
    } catch {
      toast.error("마이크 권한이 필요합니다.");
      return false;
    }
  };

  const stop = async (): Promise<string | null> => {
    const recorder = recorderRef.current;
    if (!recorder) return null;

    return new Promise((resolve) => {
      recorder.onstop = async () => {
        recorder.stream.getTracks().forEach((t) => t.stop()); // 마이크 해제
        setIsRecording(false);
        setIsTranscribing(true);

        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const form = new FormData();
        form.append("file", blob, "recording.webm");

        try {
          // Supabase Edge Function 호출 (JWT 포함 위해 supabase-js로)
          const { createClient } = await import("@/lib/supabase/client");
          const sb = createClient();
          const {
            data: { session },
          } = await sb.auth.getSession();
          const token = session?.access_token;

          const url = process.env.NEXT_PUBLIC_SUPABASE_URL! + "/functions/v1/transcribe-audio";

          const res = await fetch(url, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
              apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            },
            body: form,
          });

          const json = await res.json();
          chunksRef.current = []; // Blob 참조 즉시 해제
          setIsTranscribing(false);

          if (!json.ok) {
            toast.error("음성 인식에 실패하였습니다.");
            resolve(null);
            return;
          }
          resolve(json.text as string);
        } catch (e) {
          chunksRef.current = [];
          setIsTranscribing(false);
          toast.error("음성 인식 중 오류가 발생하였습니다.");
          resolve(null);
        }
      };
      recorder.stop();
    });
  };

  return { isRecording, isTranscribing, start, stop };
}
