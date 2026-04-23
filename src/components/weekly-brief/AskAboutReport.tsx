"use client";

import { useState, type FormEvent } from "react";
import { VoiceInputButton } from "./VoiceInputButton";

interface Props {
  reportId: string;
}

/**
 * 리포트에 대해 질문하기 — 입력된 질문을 기존 하루루 챗봇(/)으로 라우팅.
 * Phase 1은 질문을 localStorage에 태우고 메인 홈으로 이동.
 * Phase 2는 해당 리포트 컨텍스트를 챗봇에 직접 주입.
 */
export function AskAboutReport({ reportId }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = text.trim();
    if (!q) return;
    setBusy(true);
    try {
      // 챗봇에서 사용하도록 localStorage에 프리픽스로 저장
      localStorage.setItem("haruru_pending_q", `[주간 리포트 ${reportId}] ${q}`);
      // 하루루 챗봇 페이지로 이동
      window.location.href = "/";
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="wr-ask">
      <div className="wr-ask-label">이 리포트에 대해 질문하기</div>
      <form onSubmit={handleSubmit} className="wr-ask-row">
        <VoiceInputButton onTranscribed={(t) => setText((prev) => (prev ? `${prev} ${t}` : t))} />
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="예: HK005 재고 충당 타이밍은?"
          className="wr-ask-input"
          maxLength={500}
        />
        <button type="submit" className="wr-ask-submit" disabled={busy || !text.trim()}>
          전송
        </button>
      </form>
    </div>
  );
}
