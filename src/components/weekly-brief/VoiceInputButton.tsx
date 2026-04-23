"use client";

import { useVoiceInput } from "@/lib/dashboard/weekly-brief/useVoiceInput";

interface Props {
  onTranscribed: (text: string) => void;
}

export function VoiceInputButton({ onTranscribed }: Props) {
  const { isRecording, isTranscribing, start, stop } = useVoiceInput();

  const handleClick = async () => {
    if (isRecording) {
      const text = await stop();
      if (text) onTranscribed(text);
      return;
    }
    await start();
  };

  return (
    <button
      type="button"
      className={`wr-voice-btn ${isRecording ? "is-recording" : ""}`}
      onClick={handleClick}
      disabled={isTranscribing}
      aria-pressed={isRecording}
      aria-label={isRecording ? "녹음 종료" : "음성 입력 시작"}
    >
      {isTranscribing ? (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          style={{ animation: "wr-spin 0.8s linear infinite" }}
        >
          <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
        </svg>
      ) : isRecording ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      ) : (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="9" y="3" width="6" height="12" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}
