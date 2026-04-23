"use client";

// 07 v0.2 — Zustand 대체 React Context + useReducer.
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

interface AudioState {
  reportId: string | null;
  section: string | null;
  audioUrl: string | null;
  isPlaying: boolean;
  isLoading: boolean;
  progress: number;
  duration: number;
  error: string | null;
}

type Action =
  | { type: "load_start"; reportId: string; section: string }
  | { type: "load_success"; audioUrl: string; duration: number }
  | { type: "load_error"; error: string }
  | { type: "play" }
  | { type: "pause" }
  | { type: "progress"; progress: number }
  | { type: "ended" }
  | { type: "close" };

const initialState: AudioState = {
  reportId: null,
  section: null,
  audioUrl: null,
  isPlaying: false,
  isLoading: false,
  progress: 0,
  duration: 0,
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
        audioUrl: action.audioUrl,
        duration: action.duration,
        isLoading: false,
        isPlaying: true,
      };
    case "load_error":
      return { ...initialState, error: action.error };
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

  const play = useCallback(async (reportId: string, section: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
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

      const audio = new Audio(data.audio_url);
      audioRef.current = audio;

      audio.addEventListener("loadedmetadata", () => {
        dispatch({
          type: "load_success",
          audioUrl: data.audio_url,
          duration: audio.duration || 0,
        });
      });
      audio.addEventListener("timeupdate", () => {
        dispatch({
          type: "progress",
          progress: audio.duration ? audio.currentTime / audio.duration : 0,
        });
      });
      audio.addEventListener("ended", () => dispatch({ type: "ended" }));

      await audio.play();
    } catch (e) {
      dispatch({
        type: "load_error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

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
    audioRef.current?.pause();
    audioRef.current = null;
    dispatch({ type: "close" });
  }, []);

  useEffect(
    () => () => {
      audioRef.current?.pause();
      audioRef.current = null;
    },
    []
  );

  return <Ctx.Provider value={{ ...state, play, pauseResume, close }}>{children}</Ctx.Provider>;
}

export function useAudioPlayer(): AudioPlayerAPI {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAudioPlayer must be used within AudioPlayerProvider");
  return v;
}
