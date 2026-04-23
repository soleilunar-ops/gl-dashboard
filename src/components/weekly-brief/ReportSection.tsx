"use client";

import { useAudioPlayer } from "@/contexts/AudioPlayerContext";
import { MarkdownRenderer } from "@/lib/dashboard/weekly-brief/markdownRenderer";

interface Props {
  reportId: string;
  sectionKey: string;
  title: string;
  content: string;
}

export function ReportSection({ reportId, sectionKey, title, content }: Props) {
  const audio = useAudioPlayer();
  const isCurrent = audio.reportId === reportId && audio.section === sectionKey;

  const handleTts = () => {
    if (isCurrent && audio.isPlaying) {
      audio.pauseResume();
    } else {
      audio.play(reportId, sectionKey);
    }
  };

  return (
    <section id={`section-${sectionKey}`} className="wr-section">
      <header className="wr-section-head">
        <h3 className="wr-section-title">{title}</h3>
        <button
          type="button"
          className={`wr-section-tts ${isCurrent && audio.isPlaying ? "is-active" : ""}`}
          onClick={handleTts}
          aria-label={`${title} 음성 재생`}
        >
          {isCurrent && audio.isPlaying ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
      </header>
      <div className="wr-section-body">
        <MarkdownRenderer markdown={content} />
      </div>
    </section>
  );
}
