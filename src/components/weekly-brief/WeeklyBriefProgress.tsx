"use client";

import { useEffect, useState } from "react";

const STEPS = [
  { label: "생성 조건 확인", duration: 800 },
  { label: "SQL 집계 (주문)", duration: 1500 },
  { label: "SQL 집계 (재고·물류)", duration: 2500 },
  { label: "SQL 집계 (외부 신호)", duration: 1500 },
  { label: "보고서 작성 중", duration: 14000 },
  { label: "저장 · RAG 적재", duration: 2000 },
];

export function WeeklyBriefProgress() {
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    let acc = 0;
    const timers = STEPS.map((s, i) => {
      acc += s.duration;
      return setTimeout(() => setStepIdx(Math.min(i + 1, STEPS.length - 1)), acc);
    });
    return () => timers.forEach(clearTimeout);
  }, []);

  const total = STEPS.reduce((s, x) => s + x.duration, 0);
  const elapsed = STEPS.slice(0, stepIdx + 1).reduce((s, x) => s + x.duration, 0);
  const pct = Math.min(98, (elapsed / total) * 100);
  const step = STEPS[stepIdx];

  return (
    <div className="wr-progress">
      <div className="wr-progress-head">
        <span>{step.label}</span>
      </div>
      <div className="wr-progress-track">
        <div className="wr-progress-bar" style={{ width: `${pct}%` }} />
      </div>
      <p className="wr-progress-hint">보고서를 작성하고 있습니다. 약 15~25초 소요됩니다.</p>
    </div>
  );
}
