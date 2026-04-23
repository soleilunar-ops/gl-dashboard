"use client";

// 07 v0.3 — 청크 순차 재생 지원.
// Edge Function이 chunks:[{url, order}]를 반환 → 첫 청크 재생, 끝나면 다음 청크 자동 재생.
// 전역 단일 오디오 인스턴스. DashboardLayout에 한 번만 mount.

import {
  createContext,
  useContext,
  useReducer,
  useRef,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";

interface AudioChunk {
  url: string;
  order: number;
}

interface AudioState {
  reportId: string | null;
  section: string | null;
  totalChunks: number;
  currentChunk: number;
  isPlaying: boolean;
  isLoading: boolean;
  progress: number; // 전체 진행률 0~1
  error: string | null;
}

type Action =
  | { type: "load_start"; reportId: string; section: string }
  | { type: "load_success"; totalChunks: number }
  | { type: "load_error"; error: string }
  | { type: "chunk_change"; index: number }
  | { type: "play" }
  | { type: "pause" }
  | { type: "progress"; progress: number }
  | { type: "ended" }
  | { type: "close" };

const initialState: AudioState = {
  reportId: null,
  section: null,
  totalChunks: 0,
  currentChunk: 0,
  isPlaying: false,
  isLoading: false,
  progress: 0,
  error: null,
};

function reducer(state: AudioState, action: Action): AudioState {
  switch (action.type) {
    case "load_start":
      return {
        ...initialState,
        reportId: action.reportId,
        section: action.section,
        isLoading: true,
      };
    case "load_success":
      return {
        ...state,
        totalChunks: action.totalChunks,
        isLoading: false,
        isPlaying: true,
      };
    case "load_error":
      return { ...initialState, error: action.error };
    case "chunk_change":
      return { ...state, currentChunk: action.index };
    case "play":
      return { ...state, isPlaying: true };
    case "pause":
      return { ...state, isPlaying: false };
    case "progress":
      return { ...state, progress: action.progress };
    case "ended":
      return { ...state, isPlaying: false, progress: 1 };
    case "close":
      return initialState;
  }
}

interface AudioPlayerAPI extends AudioState {
  play: (reportId: string, section: string) => Promise<void>;
  pauseResume: () => void;
  close: () => void;
}

const Ctx = createContext<AudioPlayerAPI | null>(null);

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chunksRef = useRef<AudioChunk[]>([]);
  const prefetchRef = useRef<HTMLAudioElement | null>(null);

  const cleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (prefetchRef.current) {
      prefetchRef.current.src = "";
      prefetchRef.current = null;
    }
  }, []);

  const playChunk = useCallback((idx: number) => {
    const chunks = chunksRef.current;
    if (!chunks.length || idx >= chunks.length) {
      dispatch({ type: "ended" });
      return;
    }

    dispatch({ type: "chunk_change", index: idx });

    // prefetch 된 것이 있으면 재사용, 없으면 새로 생성
    const audio =
      prefetchRef.current && prefetchRef.current.src.includes(chunks[idx].url.split("?")[0])
        ? prefetchRef.current
        : new Audio(chunks[idx].url);
    prefetchRef.current = null;

    audioRef.current = audio;

    audio.addEventListener("timeupdate", () => {
      const p = audio.duration ? (idx + audio.currentTime / audio.duration) / chunks.length : 0;
      dispatch({ type: "progress", progress: p });
    });
    audio.addEventListener("ended", () => {
      if (idx + 1 < chunks.length) {
        playChunk(idx + 1);
      } else {
        dispatch({ type: "ended" });
      }
    });

    // 다음 청크 prefetch
    if (idx + 1 < chunks.length) {
      const next = new Audio(chunks[idx + 1].url);
      next.preload = "auto";
      prefetchRef.current = next;
    }

    audio.play().catch((e) => {
      dispatch({ type: "load_error", error: e instanceof Error ? e.message : String(e) });
    });
  }, []);

  const play = useCallback(
    async (reportId: string, section: string) => {
      cleanup();
      dispatch({ type: "load_start", reportId, section });

      try {
        const sb = createClient();
        const { data, error } = await sb.functions.invoke("generate-weekly-audio", {
          body: { report_id: reportId, section },
        });
        if (error || !data?.ok) {
          throw new Error(error?.message ?? data?.error ?? "TTS 실패");
        }

        const chunks: AudioChunk[] = data.chunks ?? [];
        if (!chunks.length) throw new Error("생성된 청크 없음");

        chunksRef.current = chunks;
        dispatch({ type: "load_success", totalChunks: chunks.length });
        playChunk(0);
      } catch (e) {
        dispatch({
          type: "load_error",
          error: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [cleanup, playChunk]
  );

  const pauseResume = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      a.play();
      dispatch({ type: "play" });
    } else {
      a.pause();
      dispatch({ type: "pause" });
    }
  }, []);

  const close = useCallback(() => {
    cleanup();
    chunksRef.current = [];
    dispatch({ type: "close" });
  }, [cleanup]);

  useEffect(
    () => () => {
      cleanup();
    },
    [cleanup]
  );

  return <Ctx.Provider value={{ ...state, play, pauseResume, close }}>{children}</Ctx.Provider>;
}

export function useAudioPlayer(): AudioPlayerAPI {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAudioPlayer must be used within AudioPlayerProvider");
  return v;
}
