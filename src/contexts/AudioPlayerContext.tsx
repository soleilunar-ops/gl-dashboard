"use client";

// 07 v0.4 — iOS Safari 호환성 개선.
// - 단일 Audio 엘리먼트 재사용 (기존: 청크마다 new Audio → iOS unlock 끊김)
// - playsInline 설정 (풀스크린 자동 전환 차단)
// - 사용자 탭 시점에 오디오를 즉시 초기화해 iOS 제스처 유지
//
// Edge Function이 chunks:[{url, order}]를 반환 → 첫 청크부터 순차 재생.

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
  const prefetchRef = useRef<HTMLAudioElement | null>(null);
  const chunksRef = useRef<AudioChunk[]>([]);
  const currentIdxRef = useRef<number>(0);
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  // 한 번만 Audio 엘리먼트 생성 — iOS는 user gesture로 unlock 된 같은 엘리먼트만 계속 재생 허용
  const ensureAudio = useCallback((): HTMLAudioElement => {
    if (audioRef.current) return audioRef.current;

    const audio = new Audio();
    // iOS Safari: 풀스크린 자동 전환 방지 (HTMLAudioElement 타입에 playsInline 미정의, 속성으로 지정)
    audio.setAttribute("playsinline", "");
    audio.setAttribute("webkit-playsinline", "");
    audio.preload = "auto";

    audio.addEventListener("timeupdate", () => {
      const a = audioRef.current;
      const chunks = chunksRef.current;
      const idx = currentIdxRef.current;
      if (!a || chunks.length === 0) return;
      const p = a.duration > 0 ? (idx + a.currentTime / a.duration) / chunks.length : 0;
      dispatchRef.current({ type: "progress", progress: p });
    });

    audio.addEventListener("ended", () => {
      const chunks = chunksRef.current;
      const next = currentIdxRef.current + 1;
      if (next < chunks.length) {
        playChunkRef.current?.(next);
      } else {
        dispatchRef.current({ type: "ended" });
      }
    });

    audio.addEventListener("play", () => dispatchRef.current({ type: "play" }));
    audio.addEventListener("pause", () => {
      // ended 후 자동 pause 이벤트는 무시 (progress=1 상태 유지)
      const a = audioRef.current;
      if (a && a.ended) return;
      dispatchRef.current({ type: "pause" });
    });

    audioRef.current = audio;
    return audio;
  }, []);

  // playChunk 를 ref 로 래핑 — ensureAudio 의 ended 핸들러에서 순환 참조 없이 호출
  const playChunkRef = useRef<((idx: number) => void) | null>(null);

  const playChunk = useCallback(
    (idx: number) => {
      const chunks = chunksRef.current;
      if (!chunks.length || idx >= chunks.length) {
        dispatchRef.current({ type: "ended" });
        return;
      }

      currentIdxRef.current = idx;
      dispatchRef.current({ type: "chunk_change", index: idx });

      const audio = ensureAudio();
      audio.src = chunks[idx].url;
      // prefetch 가 존재하고 다음 URL 과 일치하면 해제 (브라우저 캐시에 이미 올라감)
      if (prefetchRef.current) {
        prefetchRef.current.src = "";
        prefetchRef.current = null;
      }

      audio.play().catch((e) => {
        dispatchRef.current({
          type: "load_error",
          error: e instanceof Error ? e.message : String(e),
        });
      });

      // 다음 청크 prefetch (브라우저 HTTP 캐시에 preload)
      if (idx + 1 < chunks.length) {
        try {
          const next = new Audio();
          next.preload = "auto";
          next.src = chunks[idx + 1].url;
          prefetchRef.current = next;
        } catch {
          /* prefetch 실패해도 본 재생엔 영향 없음 */
        }
      }
    },
    [ensureAudio]
  );
  playChunkRef.current = playChunk;

  const play = useCallback(
    async (reportId: string, section: string) => {
      // iOS 핵심: 사용자 제스처 안에서 즉시 Audio 엘리먼트 생성·unlock
      const audio = ensureAudio();
      // 사용자 탭 시점에 빈 play 를 한 번 호출해 iOS unlock 유도 (무음 play → pause)
      try {
        audio.src = "";
        audio.load();
      } catch {
        /* 엘리먼트 상태 초기화 목적, 실패 무시 */
      }

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
    [ensureAudio, playChunk]
  );

  const pauseResume = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      a.play().catch((e) => {
        dispatchRef.current({
          type: "load_error",
          error: e instanceof Error ? e.message : String(e),
        });
      });
    } else {
      a.pause();
    }
  }, []);

  const close = useCallback(() => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.src = ""; // 엘리먼트는 재사용을 위해 유지
    }
    if (prefetchRef.current) {
      prefetchRef.current.src = "";
      prefetchRef.current = null;
    }
    chunksRef.current = [];
    currentIdxRef.current = 0;
    dispatch({ type: "close" });
  }, []);

  // unmount 시 정리
  useEffect(() => {
    return () => {
      const a = audioRef.current;
      if (a) {
        a.pause();
        a.src = "";
      }
      audioRef.current = null;
      if (prefetchRef.current) {
        prefetchRef.current.src = "";
        prefetchRef.current = null;
      }
    };
  }, []);

  return <Ctx.Provider value={{ ...state, play, pauseResume, close }}>{children}</Ctx.Provider>;
}

export function useAudioPlayer(): AudioPlayerAPI {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAudioPlayer must be used within AudioPlayerProvider");
  return v;
}
