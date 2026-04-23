"use client";

import { useAudioPlayer } from "@/contexts/AudioPlayerContext";
import "./weekly-brief.css";

function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

const sectionLabels: Record<string, string> = {
  insight: "종합 인사이트",
  all: "주간 리포트 전체",
  orders: "§ 1 주문",
  hotpack_season: "§ 2 핫팩 시즌",
  offseason: "§ 2' 비시즌",
  inventory: "§ 3 총재고",
  import_leadtime: "§ 4 수입 리드타임",
  milkrun: "§ 5 쿠팡 밀크런",
  external: "§ 6 외부 신호",
  noncompliance: "§ 7 납품 미준수",
};

export function AudioMiniPlayer() {
  const audio = useAudioPlayer();

  if (!audio.reportId) return null;

  const label = sectionLabels[audio.section ?? ""] ?? audio.section ?? "";
  const curTime = audio.progress * audio.duration;

  return (
    <div className="wr-root">
      <div
        className="wr-audio-player"
        role="region"
        aria-label="주간 리포트 음성 재생"
        aria-live="polite"
      >
        <button
          type="button"
          className="wr-audio-play"
          onClick={audio.pauseResume}
          disabled={audio.isLoading}
          aria-label={audio.isPlaying ? "일시정지" : "재생"}
        >
          {audio.isLoading ? <SpinnerIcon /> : audio.isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        <div className="wr-audio-meta">
          <div className="wr-audio-title">{label}</div>
          <div className="wr-audio-progress">
            <div className="wr-audio-bar" style={{ width: `${audio.progress * 100}%` }} />
          </div>
          <div className="wr-audio-time">
            {formatTime(curTime)} / {formatTime(audio.duration)}
          </div>
        </div>
        <button type="button" className="wr-audio-close" onClick={audio.close} aria-label="닫기">
          ✕
        </button>
      </div>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  );
}
function SpinnerIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      style={{ animation: "wr-spin 0.8s linear infinite" }}
    >
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
      <style>{`@keyframes wr-spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  );
}
