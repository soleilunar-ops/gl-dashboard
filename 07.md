# 07. 주간 리포트 · 프론트엔드 UI (v0.2)

> 주간 리포트의 **프론트엔드 UI 설계**. 메인 대시보드 통합은 `08_dashboard_main.md` 참조.
> 백엔드(Edge Function · DB)는 `06_weekly_report.md` 참조.

---

## 1. 설계 원칙

1. **메인 대시보드 일체화** — 브리핑 카드 → 내러티브 브릿지 → 주간리포트 카드로 이어지는 수직 흐름
2. **하단 주황 CTA가 핵심 액션** — 상단 우측은 보조 버튼(보기/듣기)만. 생성 버튼은 하단 큰 주황 버튼
3. **공식 톤 UI 일관성** — 카드 배지·문구·섹션 라벨 모두 격식체. 이모지 최소 사용
4. **상태 관리는 React Context** — Zustand 사용 안 함. TanStack Query(서버 상태) + Context(UI 상태) 2축
5. **모바일·데스크톱 동등** — TTS·STT 모두 모바일에서도 동일 동작. 하단 sticky 플레이어
6. **음성 격리** — 녹음 Blob은 메모리에서만 존재. DB·Storage 저장 안 함

---

## 2. 색상 토큰 (주황 CTA 확정)

브리핑 카드가 쓰는 `hb-*` 팔레트와 구분되는 **`wr-*` (weekly-report) 프리픽스**로 격리.

```css
.wr-root {
  /* Primary CTA — 주황 (검정 대체) */
  --wr-primary: #f97316; /* orange-500 */
  --wr-primary-hover: #ea580c; /* orange-600 */
  --wr-primary-soft: #fff7ed; /* orange-50 */
  --wr-primary-text: #c2410c; /* orange-700 */

  /* Surface */
  --wr-card: #ffffff;
  --wr-card-muted: #f8fafc;
  --wr-border: #e5e7eb;
  --wr-border-soft: #f1f3f5;

  /* Text */
  --wr-ink: #0f172a;
  --wr-muted: #64748b;
  --wr-subtle: #94a3b8;

  /* Alerts */
  --wr-warning: #f59e0b;
  --wr-warning-soft: #fffbeb;
  --wr-warning-ink: #b45309;

  /* Accent (report section chip · audio progress) */
  --wr-accent: #6366f1; /* 보라 배지 */
}
```

> **원칙**: 모든 "생성/실행" 계열 주요 버튼은 `--wr-primary` 주황. 기존 검정 CTA는 사용 안 함.
> 브리핑 카드의 검정 CTA(`hb-cta-button`)는 그대로 두고, 주간리포트 영역에서만 주황 사용.

---

## 3. 메인 카드 레이아웃

### 3-1. 상태별 렌더링 (5가지)

**상태 A — 금주 리포트 존재**

```
┌────────────────────────────────────────────────────────┐
│ [📋 주간 리포트]  W47 · 2025-11-17 ~ 11-23            │
│ 26시즌 W47 주간 리포트                                 │
│ 생성: 2025-11-17 09:12 · 쿠팡 26시즌                   │
│                          [📄 전체 보기] [🔊 인사이트]  │
├────────────────────────────────────────────────────────┤
│ 이번 주 헤드라인                                        │
│ 군인 핫팩 160g 결품 위험 임박, 자사 재고로 3일 내 충당  │
│ 가능. 다음 주 한파 재도래로 검색량 추가 상승 예상.     │
├────────────────────────────────────────────────────────┤
│ ⚠ 주의사항 3건                                         │
│ · 군인 핫팩 쿠팡 재고 180개, 밀크런 즉시 처리 권장     │
│ · 지엘팜 승인 대기 42건, 최장 7일 경과                 │
│ · 붙이는 불가마 쿠팡 15% 수준, 12/3 도착 예정         │
├────────────────────────────────────────────────────────┤
│ §1 주문 §2 시즌 §3 재고 §4 수입 §5 밀크런 §6 외부 §7 미준수 │
├────────────────────────────────────────────────────────┤
│ 금주 생성 1/2회 · 다음 가능: 금요일  💬 질문하기 →     │
├────────────────────────────────────────────────────────┤
│                                                         │
│    [ ✨ 이번 주 리포트 새로 생성하기 ]  ← 주황 큰 CTA   │
│                                                         │
└────────────────────────────────────────────────────────┘
```

**상태 B — 리포트 없음, 오늘이 월/금**

```
┌────────────────────────────────────────────────────────┐
│ [📋 주간 리포트]                                        │
│ 금주(11/17~11/23) 주간 리포트가 아직 생성되지 않았습니다│
│                                                         │
│ 최근 리포트                                            │
│ · W46 (11/10 생성) [보기]                              │
│ · W45 (11/03 생성) [보기]                              │
├────────────────────────────────────────────────────────┤
│                                                         │
│    [ ✨ 이번 주 리포트 새로 생성하기 ]  ← 주황 큰 CTA   │
│                                                         │
└────────────────────────────────────────────────────────┘
```

**상태 C — 오늘이 월/금 아님**

```
┌────────────────────────────────────────────────────────┐
│ [📋 주간 리포트]                                        │
│ 주간 리포트는 월요일 · 금요일에 생성할 수 있습니다.     │
│ 다음 생성 가능일: 2025-11-21 (금)                       │
│                                                         │
│ 최근 리포트                                            │
│ · W46 (11/10 생성) [보기]                              │
├────────────────────────────────────────────────────────┤
│                                                         │
│    [ 금요일에 활성화됩니다 ]  ← 회색 비활성 버튼        │
│                                                         │
└────────────────────────────────────────────────────────┘
```

**상태 D — 주 2회 한도 도달**

```
┌────────────────────────────────────────────────────────┐
│ [📋 주간 리포트] W47                                    │
│ 금주 생성 한도에 도달하였습니다 (2/2회)                  │
│                           [📄 보기] [🔊 듣기]           │
├────────────────────────────────────────────────────────┤
│  (헤드라인·주의사항·섹션 칩은 상태 A와 동일)            │
├────────────────────────────────────────────────────────┤
│                                                         │
│    [ 차주 월요일부터 다시 생성 가능 ]  ← 회색 비활성    │
│                                                         │
└────────────────────────────────────────────────────────┘
```

**상태 E — 생성 중**

```
┌────────────────────────────────────────────────────────┐
│ [📋 주간 리포트 생성 중...]                             │
│                                                         │
│  ▓▓▓▓▓▓▓░░░░░░░░░░░░░░░  45%                          │
│  📊 SQL 집계 (재고 · 3/7)                              │
│                                                         │
│  약 15~25초 소요됩니다. 잠시만 기다려 주세요.           │
└────────────────────────────────────────────────────────┘
```

### 3-2. 버튼 배치 원칙

| 위치                    | 버튼                               | 스타일                              |
| ----------------------- | ---------------------------------- | ----------------------------------- |
| 상단 우측               | 전체 보기 · 인사이트 듣기          | `wr-btn wr-btn-ghost` (연한 테두리) |
| 하단 (card footer 아래) | **이번 주 리포트 새로 생성하기**   | **`wr-btn-primary` 주황 큰 버튼**   |
| Footer 좌측             | Gate 상태 텍스트                   | muted                               |
| Footer 우측             | 리포트에 대해 질문하기 (챗봇 열기) | `wr-primary-text` 링크              |

---

## 4. 컴포넌트 구조

```
src/components/dashboard/weekly-brief/
├── WeeklyBriefCard.tsx              # 메인 카드 (상태 A~E 분기)
├── WeeklyBriefHeadline.tsx          # 헤드라인 박스 (주황 아이콘 + 본문)
├── WeeklyBriefAlerts.tsx            # 주의사항 3건 (노란 배경)
├── WeeklyBriefSectionChips.tsx      # §1~§7 칩 (호버 TTS 아이콘)
├── WeeklyBriefFooter.tsx            # Gate 상태 + 질문 링크
├── WeeklyBriefGenerateCTA.tsx       # 🆕 하단 큰 주황 CTA (상태 머신)
├── WeeklyBriefProgress.tsx          # 생성 중 프로그레스 표시
├── WeeklyBriefHistory.tsx           # 리포트 목록 (상태 B/C에서 노출)
├── WeeklyBriefModal.tsx             # 상세 뷰 모달 (전체 보기)
├── ReportSection.tsx                # 상세 뷰의 섹션 하나
├── ReportSectionToc.tsx             # 상세 뷰 사이드 목차
├── AudioMiniPlayer.tsx              # 하단 sticky 음성 플레이어
├── VoiceInputButton.tsx             # STT 녹음 버튼
├── AskAboutReport.tsx               # "이 리포트에 대해 질문하기" → 챗봇 열기
└── weekly-brief.css

src/lib/dashboard/weekly-brief/
├── useWeeklyBriefGate.ts            # can_generate_weekly_brief 조회
├── useGenerateWeeklyBrief.ts        # 생성 mutation
├── useWeeklyBrief.ts                # 단일 리포트 조회
├── useWeeklyBriefList.ts            # 히스토리 조회
├── useVoiceInput.ts                 # STT 녹음 훅
├── markdownRenderer.tsx             # [ref:sql.row_N] 툴팁 렌더
└── types.ts

src/contexts/
└── AudioPlayerContext.tsx           # 🆕 React Context (전역 오디오 상태)
```

---

## 5. 상태 관리 — React Context (Zustand 대체)

### 5-1. 전역 오디오 플레이어 Context

```typescript
// src/contexts/AudioPlayerContext.tsx
"use client";
import {
  createContext, useContext, useReducer, useRef, useCallback,
  useEffect, type ReactNode
} from "react";
import { supabase } from "@/lib/supabase";

interface AudioState {
  reportId: string | null;
  section: string | null;
  audioUrl: string | null;
  isPlaying: boolean;
  isLoading: boolean;
  progress: number;     // 0~1
  duration: number;     // seconds
  error: string | null;
}

type Action =
  | { type: 'load_start'; reportId: string; section: string }
  | { type: 'load_success'; audioUrl: string; duration: number }
  | { type: 'load_error'; error: string }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'progress'; progress: number }
  | { type: 'ended' }
  | { type: 'close' };

const initialState: AudioState = {
  reportId: null, section: null, audioUrl: null,
  isPlaying: false, isLoading: false, progress: 0, duration: 0, error: null,
};

function reducer(state: AudioState, action: Action): AudioState {
  switch (action.type) {
    case 'load_start':
      return { ...initialState, reportId: action.reportId, section: action.section, isLoading: true };
    case 'load_success':
      return { ...state, audioUrl: action.audioUrl, duration: action.duration, isLoading: false, isPlaying: true };
    case 'load_error':
      return { ...initialState, error: action.error };
    case 'play':  return { ...state, isPlaying: true };
    case 'pause': return { ...state, isPlaying: false };
    case 'progress': return { ...state, progress: action.progress };
    case 'ended': return { ...state, isPlaying: false, progress: 1 };
    case 'close': return initialState;
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
    // 기존 재생 중단
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    dispatch({ type: 'load_start', reportId, section });

    try {
      const { data, error } = await supabase.functions.invoke('generate-weekly-audio', {
        body: { report_id: reportId, section },
      });
      if (error || !data?.ok) throw new Error(error?.message ?? data?.error ?? 'TTS 실패');

      const audio = new Audio(data.audio_url);
      audioRef.current = audio;

      audio.addEventListener('loadedmetadata', () => {
        dispatch({ type: 'load_success', audioUrl: data.audio_url, duration: audio.duration });
      });
      audio.addEventListener('timeupdate', () => {
        dispatch({ type: 'progress', progress: audio.currentTime / (audio.duration || 1) });
      });
      audio.addEventListener('ended', () => dispatch({ type: 'ended' }));

      await audio.play();
    } catch (e) {
      dispatch({ type: 'load_error', error: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  const pauseResume = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) { a.play(); dispatch({ type: 'play' }); }
    else          { a.pause(); dispatch({ type: 'pause' }); }
  }, []);

  const close = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    dispatch({ type: 'close' });
  }, []);

  // 언마운트 시 정리
  useEffect(() => () => { audioRef.current?.pause(); audioRef.current = null; }, []);

  return (
    <Ctx.Provider value={{ ...state, play, pauseResume, close }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAudioPlayer(): AudioPlayerAPI {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAudioPlayer must be used within AudioPlayerProvider");
  return v;
}
```

### 5-2. 서버 상태는 TanStack Query로

```typescript
// src/lib/dashboard/weekly-brief/useWeeklyBriefGate.ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface GateResult {
  allowed: boolean;
  reason?: string;
  count_this_week: number;
  limit: number;
  next_available?: "this_monday" | "this_friday" | "next_monday";
}

export function useWeeklyBriefGate() {
  return useQuery<GateResult>({
    queryKey: ["weekly-brief-gate"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("can_generate_weekly_brief");
      if (error) throw error;
      return data as GateResult;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}
```

```typescript
// src/lib/dashboard/weekly-brief/useGenerateWeeklyBrief.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export function useGenerateWeeklyBrief() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (opts: { weekStart?: string; force?: boolean } = {}) => {
      const { data, error } = await supabase.functions.invoke("generate-weekly-brief", {
        body: opts,
      });
      if (error) throw error;
      if (!data.ok) throw new Error(data.error ?? "생성 실패");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["weekly-brief-gate"] });
      qc.invalidateQueries({ queryKey: ["weekly-brief-list"] });
      qc.invalidateQueries({ queryKey: ["weekly-brief-latest"] });
    },
  });
}
```

---

## 6. 하단 주황 CTA (핵심 컴포넌트)

```typescript
// src/components/dashboard/weekly-brief/WeeklyBriefGenerateCTA.tsx
"use client";
import { useWeeklyBriefGate } from "@/lib/dashboard/weekly-brief/useWeeklyBriefGate";
import { useGenerateWeeklyBrief } from "@/lib/dashboard/weekly-brief/useGenerateWeeklyBrief";
import { WeeklyBriefProgress } from "./WeeklyBriefProgress";

export function WeeklyBriefGenerateCTA() {
  const { data: gate, isLoading: gateLoading } = useWeeklyBriefGate();
  const generate = useGenerateWeeklyBrief();

  if (gateLoading) {
    return (
      <div className="wr-cta-wrap">
        <button className="wr-cta-button wr-cta-loading" disabled>
          확인 중...
        </button>
      </div>
    );
  }

  // 생성 중
  if (generate.isPending) {
    return (
      <div className="wr-cta-wrap">
        <WeeklyBriefProgress />
      </div>
    );
  }

  // 생성 직후 에러
  if (generate.isError) {
    return (
      <div className="wr-cta-wrap">
        <div className="wr-error-box">
          ⚠ 생성 중 오류가 발생하였습니다. 잠시 후 다시 시도해 주세요.
          <p className="wr-error-detail">{generate.error?.message}</p>
        </div>
        <button
          className="wr-cta-button wr-cta-primary"
          onClick={() => { generate.reset(); generate.mutate({}); }}
        >
          다시 생성하기
        </button>
      </div>
    );
  }

  // gate 비활성
  if (!gate?.allowed) {
    const label =
      gate?.reason?.includes('월요일') ? getDisabledLabel(gate.next_available)
      : gate?.reason?.includes('한도')  ? '차주 월요일부터 다시 생성 가능'
      : '생성할 수 없습니다';

    return (
      <div className="wr-cta-wrap">
        <button className="wr-cta-button wr-cta-disabled" disabled title={gate?.reason}>
          {label}
        </button>
      </div>
    );
  }

  // 정상 — 주황 큰 CTA
  return (
    <div className="wr-cta-wrap">
      <button
        className="wr-cta-button wr-cta-primary"
        onClick={() => generate.mutate({})}
        data-testid="weekly-brief-generate"
      >
        <SparkleIcon />
        이번 주 리포트 새로 생성하기
      </button>
      <p className="wr-cta-hint">
        금주 {gate.count_this_week}/{gate.limit}회 사용 · 약 15~25초 소요
      </p>
    </div>
  );
}

function getDisabledLabel(next?: string): string {
  switch (next) {
    case 'this_monday':  return '월요일에 활성화됩니다';
    case 'this_friday':  return '금요일에 활성화됩니다';
    case 'next_monday':  return '다음 주 월요일에 활성화됩니다';
    default: return '월·금요일에 활성화됩니다';
  }
}

function SparkleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z"/>
    </svg>
  );
}
```

### 6-1. CTA 스타일

```css
.wr-cta-wrap {
  padding: 20px 24px 24px;
  border-top: 1px solid var(--wr-border-soft);
  background: var(--wr-card);
}

.wr-cta-button {
  width: 100%;
  border: none;
  font-family: inherit;
  font-size: 14.5px;
  font-weight: 600;
  padding: 15px 20px;
  border-radius: 12px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 52px;
  transition:
    background 0.15s ease,
    transform 0.1s ease;
}

.wr-cta-primary {
  background: var(--wr-primary);
  color: #ffffff;
  box-shadow: 0 4px 12px -2px rgba(249, 115, 22, 0.35);
}
.wr-cta-primary:hover {
  background: var(--wr-primary-hover);
}
.wr-cta-primary:active {
  transform: translateY(1px);
}

.wr-cta-disabled {
  background: #f1f5f9;
  color: #94a3b8;
  cursor: not-allowed;
  box-shadow: none;
}

.wr-cta-loading {
  background: #f8fafc;
  color: #64748b;
  cursor: wait;
}

.wr-cta-hint {
  text-align: center;
  font-size: 11px;
  color: var(--wr-muted);
  margin-top: 8px;
  font-family: "JetBrains Mono", monospace;
}

.wr-error-box {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  padding: 12px 14px;
  border-radius: 8px;
  font-size: 13px;
  margin-bottom: 10px;
}
.wr-error-detail {
  margin-top: 6px;
  font-size: 11px;
  color: #b91c1c;
  font-family: "JetBrains Mono", monospace;
}
```

---

## 7. 생성 진행 표시

실제 SSE 스트리밍은 Phase 2. Phase 1은 시뮬레이션 단계.

```typescript
// src/components/dashboard/weekly-brief/WeeklyBriefProgress.tsx
"use client";
import { useEffect, useState } from "react";

const STEPS = [
  { label: '생성 조건 확인',            duration: 800,   icon: '🔍' },
  { label: 'SQL 집계 (주문)',          duration: 1500,  icon: '📊' },
  { label: 'SQL 집계 (재고 · 물류)',   duration: 2500,  icon: '📦' },
  { label: 'SQL 집계 (외부 신호)',     duration: 1500,  icon: '🌡' },
  { label: '보고서 작성 중',            duration: 14000, icon: '✍' },
  { label: '저장 · RAG 적재',          duration: 2000,  icon: '💾' },
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
        <span className="wr-progress-icon" aria-hidden>{step.icon}</span>
        <span className="wr-progress-label">{step.label}</span>
      </div>
      <div className="wr-progress-track">
        <div className="wr-progress-bar" style={{ width: `${pct}%` }} />
      </div>
      <p className="wr-progress-hint">
        보고서를 작성하고 있습니다. 약 15~25초 소요됩니다.
      </p>
    </div>
  );
}
```

```css
.wr-progress {
  padding: 20px 16px;
  background: var(--wr-primary-soft);
  border-radius: 12px;
  border: 1px solid #ffedd5;
}
.wr-progress-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--wr-primary-text);
}
.wr-progress-icon {
  font-size: 16px;
}
.wr-progress-track {
  height: 6px;
  background: #ffedd5;
  border-radius: 3px;
  overflow: hidden;
}
.wr-progress-bar {
  height: 100%;
  background: var(--wr-primary);
  border-radius: 3px;
  transition: width 0.3s ease;
}
.wr-progress-hint {
  text-align: center;
  font-size: 11.5px;
  color: var(--wr-primary-text);
  margin-top: 10px;
}
```

---

## 8. 상세 뷰 모달

### 8-1. URL 동기화

- `?brief=<report_id>` → 모달 열림
- `?brief=<id>#section-orders` → 해당 섹션으로 스크롤

```typescript
// src/components/dashboard/weekly-brief/WeeklyBriefModal.tsx
"use client";
import { useSearchParams, useRouter } from "next/navigation";
import { useWeeklyBrief } from "@/lib/dashboard/weekly-brief/useWeeklyBrief";

export function WeeklyBriefModal() {
  const params = useSearchParams();
  const router = useRouter();
  const reportId = params.get('brief');

  if (!reportId) return null;

  return (
    <div className="wr-modal-backdrop" onClick={() => router.back()}>
      <div className="wr-modal" onClick={(e) => e.stopPropagation()}>
        <WeeklyBriefModalContent reportId={reportId} />
      </div>
    </div>
  );
}
```

### 8-2. 섹션 렌더

```typescript
// src/components/dashboard/weekly-brief/ReportSection.tsx
"use client";
import { useAudioPlayer } from "@/contexts/AudioPlayerContext";
import { MarkdownRenderer } from "@/lib/dashboard/weekly-brief/markdownRenderer";

interface Props {
  reportId: string;
  sectionKey: string;     // 'orders' | 'inventory' | ...
  title: string;          // "§ 1. 주문 현황"
  content: string;        // 마크다운 with [ref:sql.row_N]
}

export function ReportSection({ reportId, sectionKey, title, content }: Props) {
  const audio = useAudioPlayer();
  const isCurrent = audio.reportId === reportId && audio.section === sectionKey;

  return (
    <section id={`section-${sectionKey}`} className="wr-section">
      <header className="wr-section-head">
        <h3 className="wr-section-title">{title}</h3>
        <button
          className={`wr-section-tts ${isCurrent && audio.isPlaying ? 'is-active' : ''}`}
          onClick={() => isCurrent && audio.isPlaying ? audio.pauseResume() : audio.play(reportId, sectionKey)}
          aria-label={`${title} 음성 재생`}
        >
          {isCurrent && audio.isPlaying ? '⏸' : '🔊'}
        </button>
      </header>
      <div className="wr-section-body">
        <MarkdownRenderer markdown={content} />
      </div>
    </section>
  );
}
```

### 8-3. `[ref:sql.row_N]` 툴팁 렌더

```typescript
// src/lib/dashboard/weekly-brief/markdownRenderer.tsx
"use client";
import ReactMarkdown from "react-markdown";

const REF_PATTERN = /\[ref:([^\]]+)\]/g;

export function MarkdownRenderer({ markdown }: { markdown: string }) {
  // 텍스트에서 [ref:...] 토큰 찾아 <RefTag>로 치환
  const processed = markdown.replace(REF_PATTERN, (_, id) =>
    `<ref-tag data-id="${id}"></ref-tag>`
  );

  return (
    <ReactMarkdown
      components={{
        // @ts-expect-error custom element
        'ref-tag': ({ 'data-id': id }) => (
          <sup
            className="wr-ref-tag"
            title={`출처: ${id}`}
            tabIndex={0}
          >
            [{id}]
          </sup>
        ),
      }}
      rehypePlugins={[require('rehype-raw')]}
    >
      {processed}
    </ReactMarkdown>
  );
}
```

---

## 9. 음성 UX

### 9-1. 하단 Sticky 플레이어 (모바일·데스크톱 공통)

```typescript
// src/components/dashboard/weekly-brief/AudioMiniPlayer.tsx
"use client";
import { useAudioPlayer } from "@/contexts/AudioPlayerContext";

export function AudioMiniPlayer() {
  const audio = useAudioPlayer();

  if (!audio.reportId) return null;

  const label = audio.section === 'insight' ? '종합 인사이트'
              : audio.section === 'all'     ? '주간 리포트 전체'
              : `§ ${audio.section}`;

  return (
    <div
      className="wr-audio-player"
      role="region"
      aria-label="주간 리포트 음성 재생"
      aria-live="polite"
    >
      <button
        className="wr-audio-play"
        onClick={audio.pauseResume}
        disabled={audio.isLoading}
        aria-label={audio.isPlaying ? '일시정지' : '재생'}
      >
        {audio.isLoading ? <Spinner /> : audio.isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>
      <div className="wr-audio-meta">
        <div className="wr-audio-title">{label}</div>
        <div className="wr-audio-progress">
          <div className="wr-audio-bar" style={{ width: `${audio.progress * 100}%` }} />
        </div>
        <div className="wr-audio-time">
          {formatTime(audio.progress * audio.duration)} / {formatTime(audio.duration)}
        </div>
      </div>
      <button className="wr-audio-close" onClick={audio.close} aria-label="닫기">
        ✕
      </button>
    </div>
  );
}
```

### 9-2. STT 녹음 버튼

```typescript
// src/lib/dashboard/weekly-brief/useVoiceInput.ts
"use client";
import { useState, useRef } from "react";
import { toast } from "@/lib/toast";

export function useVoiceInput() {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      toast.error("마이크 권한이 필요합니다.");
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
          const res = await fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/transcribe-audio`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
              },
              body: form,
            }
          );
          const json = await res.json();
          chunksRef.current = []; // blob 참조 제거
          setIsTranscribing(false);

          if (!json.ok) {
            toast.error("음성 인식에 실패하였습니다.");
            resolve(null);
            return;
          }
          resolve(json.text);
        } catch (e) {
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
```

```typescript
// src/components/dashboard/weekly-brief/VoiceInputButton.tsx
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
      if (text) onTranscribed(text);   // 자동 전송 X — 입력창에 채움
    } else {
      await start();
    }
  };

  return (
    <button
      className={`wr-voice-btn ${isRecording ? 'is-recording' : ''}`}
      onClick={handleClick}
      disabled={isTranscribing}
      aria-pressed={isRecording}
      aria-label={isRecording ? '녹음 종료' : '음성 입력 시작'}
    >
      {isTranscribing ? <Spinner /> : isRecording ? '⏹' : '🎤'}
    </button>
  );
}
```

**음성 파일 보호 원칙**:

- `stop()` 완료 후 즉시 `chunksRef.current = []`
- 서버는 텍스트만 반환 (06 § 8-4)
- IndexedDB·LocalStorage 저장 없음
- 브라우저 GC에 맡겨 자동 정리

---

## 10. 반응형 디자인

### 10-1. 브레이크포인트

| 범위              | 레이아웃                                                    |
| ----------------- | ----------------------------------------------------------- |
| `< 640px` (sm)    | 섹션 칩 2열, 헤더 액션 버튼 wrap, 플레이어 하단 전폭 sticky |
| `640~1024px` (md) | 섹션 칩 4열, 플레이어 하단 전폭                             |
| `≥ 1024px` (lg)   | 섹션 칩 7열, 플레이어 우하단 floating                       |

### 10-2. 주요 미디어 쿼리

```css
/* 섹션 칩 7개 */
.wr-section-chips {
  display: grid;
  gap: 8px;
  padding: 16px 24px;
  grid-template-columns: repeat(7, 1fr);
}
@media (max-width: 1023px) {
  .wr-section-chips {
    grid-template-columns: repeat(4, 1fr);
  }
}
@media (max-width: 639px) {
  .wr-section-chips {
    grid-template-columns: repeat(2, 1fr);
    padding: 14px 16px;
  }
}

/* 헤더 액션 */
.wr-header-actions {
  display: flex;
  gap: 6px;
}
@media (max-width: 639px) {
  .wr-header-actions {
    flex-wrap: wrap;
    width: 100%;
    margin-top: 12px;
  }
  .wr-header-actions button {
    flex: 1;
    min-width: 0;
  }
}

/* 하단 CTA 모바일 */
@media (max-width: 639px) {
  .wr-cta-wrap {
    padding: 16px 16px 20px;
  }
  .wr-cta-button {
    font-size: 14px;
    min-height: 48px;
  }
}

/* 오디오 플레이어 */
.wr-audio-player {
  position: sticky;
  bottom: 0;
  background: #ffffff;
  border-top: 1px solid var(--wr-border);
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 50;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.06);
}
@media (min-width: 1024px) {
  .wr-audio-player {
    position: fixed;
    bottom: 20px;
    right: 20px;
    left: auto;
    width: 360px;
    border-radius: 14px;
    border: 1px solid var(--wr-border);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
  }
}
```

---

## 11. 대시보드 차트 → 리포트 딥링크

| 대시보드 영역 | 리포트 섹션 ID             |
| ------------- | -------------------------- |
| 주문 관리     | `#section-orders`          |
| 핫팩 시즌     | `#section-hotpack_season`  |
| 총재고        | `#section-inventory`       |
| 수입 리드타임 | `#section-import_leadtime` |
| 쿠팡 밀크런   | `#section-milkrun`         |
| 재작업일 날씨 | `#section-external`        |

```tsx
// 예: 핫팩 차트 툴팁
<Link href={`?brief=${latestBriefId}#section-hotpack_season`}>해당 주 리포트 보기</Link>
```

---

## 12. 에러 처리 매트릭스

| 케이스                | UI                                                                    |
| --------------------- | --------------------------------------------------------------------- |
| Gate 조회 실패        | "리포트 상태를 확인할 수 없습니다. 새로고침해 주세요."                |
| 생성 30초 타임아웃    | "생성이 오래 소요되고 있습니다. 잠시 후 목록에서 확인해 주세요."      |
| 생성 429 (gate 거부)  | gate.reason 그대로 표시                                               |
| 생성 500              | "일시적 오류. 다시 시도해 주세요." + 다시 생성 버튼                   |
| TTS 생성 실패         | 토스트 · 텍스트는 그대로 표시                                         |
| STT 권한 거부         | "마이크 권한이 필요합니다. 브라우저 설정을 확인해 주세요."            |
| STT 인식 실패         | "음성이 인식되지 않았습니다. 다시 시도하거나 텍스트로 입력해 주세요." |
| 리포트 JSON 파싱 실패 | "리포트를 표시할 수 없습니다. 새로 생성해 주세요."                    |
| 자동재생 차단 (iOS)   | 최초 재생은 사용자 클릭 제스처에서만 시작                             |

---

## 13. 검증 체크리스트

### 상태

- [ ] A (금주 리포트 있음) 렌더
- [ ] B (월/금, 리포트 없음) 렌더 + 주황 CTA 활성
- [ ] C (월/금 아님) → 회색 비활성 버튼 + 다음 가능일 표시
- [ ] D (2/2 도달) → 회색 비활성
- [ ] E (생성 중) → 주황 프로그레스

### CTA

- [ ] 주황 배경 `#F97316`, hover 시 `#EA580C`
- [ ] 하단 위치 (상단 우측에는 "새로 생성" 없음)
- [ ] 생성 중에는 프로그레스 표시로 대체
- [ ] 터치 타겟 최소 48×48px

### React Context

- [ ] `AudioPlayerProvider`가 대시보드 루트에 한 번만 존재
- [ ] `useAudioPlayer()` Provider 밖 호출 시 명확한 에러
- [ ] Zustand 의존 없음 (`package.json` 확인)

### 공식 톤

- [ ] 카드 문구에 이모지 최소 (§, ✨, ⚠ 외 없음)
- [ ] 모든 문장 경어체 ("~합니다", "~됩니다")
- [ ] "하루루가~" 1인칭 표현 없음

### 음성

- [ ] 재생 중 섹션 이동해도 지속 재생
- [ ] 다른 섹션 🔊 누르면 이전 정지 후 새로 시작
- [ ] STT 녹음 종료 후 입력창에 텍스트 채움 (자동 전송 X)
- [ ] 녹음 종료 후 `chunksRef.current = []` 확인
- [ ] 서버 응답 200 후 Blob 참조 완전 제거

### 반응형

- [ ] `< 640`: 섹션 칩 2열, 하단 sticky 플레이어 전폭
- [ ] `≥ 1024`: 섹션 칩 7열, 플레이어 우하단 floating

---

## 14. Phase 2 확장

- 리포트 생성 SSE 스트리밍 (프로그레스 실시간)
- 섹션별 개별 재생성
- 리포트 공유 링크 (Slack · 이메일)
- PDF 내보내기
- 리포트 비교 뷰 (금주 vs 전주)
- 자동 생성 옵션 (alpha_user)

---

## 15. 변경 이력

| 버전 | 날짜       | 내용                                                                                                                                                                                                                                                                                                      |
| ---- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v0.1 | 2026-04-22 | 초안                                                                                                                                                                                                                                                                                                      |
| v0.2 | 2026-04-23 | **재작성**. Zustand → **React Context** + TanStack Query 2축. CTA 색상 **검정 → 주황** (`#F97316`). 상단은 보기/듣기 보조만, **하단 주황 큰 CTA가 주 액션**. 공식 사내 보고서 톤 UI 일관성 확정 (이모지 최소, 1인칭 금지). 월/금 가드 반영. 5상태 머신(A~E) 명시. `wr-*` 프리픽스로 브리핑 `hb-*`와 격리. |
