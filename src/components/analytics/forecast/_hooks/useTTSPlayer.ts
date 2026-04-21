"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FASTAPI_URL } from "@/lib/constants";

type TTSState = "idle" | "loading" | "playing" | "paused" | "error";

export const TTS_VOICES = [
  { value: "shimmer", label: "Shimmer (여성, 부드러움)" },
  { value: "alloy", label: "Alloy (중성, 균형)" },
  { value: "nova", label: "Nova (여성, 따뜻함)" },
  { value: "sage", label: "Sage (여성, 차분)" },
  { value: "coral", label: "Coral (여성, 밝음)" },
  { value: "ash", label: "Ash (남성, 차분)" },
  { value: "echo", label: "Echo (남성, 중립)" },
  { value: "onyx", label: "Onyx (남성, 깊은 톤)" },
  { value: "fable", label: "Fable (남성, 영국식)" },
] as const;

export type TTSVoice = (typeof TTS_VOICES)[number]["value"];

const VOICE_STORAGE_KEY = "forecast-tts-voice";
const DEFAULT_VOICE: TTSVoice = "shimmer";
const DEFAULT_INSTRUCTIONS =
  "차분하고 명확한 업무 브리핑 톤으로, 숫자와 제품명을 또박또박 읽어주세요. 아나운서처럼 자연스러운 한국어 억양을 사용하세요.";

/**
 * OpenAI TTS 재생 훅.
 *
 * 흐름: GET /forecast/briefing-text → POST /forecast/tts (mp3 스트림) → Audio 재생.
 * 음성 선택 변경 시 자동으로 캐시 폐기 후 재합성.
 */
export function useTTSPlayer() {
  const [state, setState] = useState<TTSState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [voice, setVoiceState] = useState<TTSVoice>(DEFAULT_VOICE);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const cachedVoiceRef = useRef<TTSVoice | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(VOICE_STORAGE_KEY) as TTSVoice | null;
    if (saved && TTS_VOICES.some((v) => v.value === saved)) setVoiceState(saved);
  }, []);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  const setVoice = useCallback((next: TTSVoice) => {
    setVoiceState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(VOICE_STORAGE_KEY, next);
    }
    // 음성이 바뀌면 기존 캐시 폐기
    audioRef.current?.pause();
    audioRef.current = null;
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    cachedVoiceRef.current = null;
    setState("idle");
    setError(null);
  }, []);

  const play = useCallback(async () => {
    setError(null);

    // 같은 음성으로 기존 오디오가 있으면 재사용
    if (audioRef.current && objectUrlRef.current && cachedVoiceRef.current === voice) {
      try {
        await audioRef.current.play();
        setState("playing");
      } catch (e) {
        setState("error");
        setError(e instanceof Error ? e.message : "재생 실패");
      }
      return;
    }

    setState("loading");
    try {
      const briefingRes = await fetch(`${FASTAPI_URL}/forecast/briefing-text`);
      if (!briefingRes.ok) throw new Error(`브리핑 텍스트 조회 실패 (${briefingRes.status})`);
      const briefing: { text: string; date: string } = await briefingRes.json();

      const ttsRes = await fetch(`${FASTAPI_URL}/forecast/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: briefing.text,
          voice,
          model: "gpt-4o-mini-tts",
          instructions: DEFAULT_INSTRUCTIONS,
        }),
      });
      if (!ttsRes.ok) {
        const detail = await ttsRes.text().catch(() => "");
        throw new Error(`TTS 합성 실패 (${ttsRes.status}) ${detail.slice(0, 120)}`);
      }

      const blob = await ttsRes.blob();
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      cachedVoiceRef.current = voice;

      const audio = new Audio(url);
      audio.addEventListener("ended", () => setState("idle"));
      audio.addEventListener("pause", () => {
        if (!audio.ended) setState("paused");
      });
      audio.addEventListener("play", () => setState("playing"));
      audioRef.current = audio;

      await audio.play();
      setState("playing");
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
    }
  }, [voice]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setState("idle");
  }, []);

  return { state, error, voice, setVoice, play, pause, stop };
}
