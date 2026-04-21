"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Props {
  seasonName: string | null;
}

type State = { kind: "idle" } | { kind: "loading" } | { kind: "placeholder"; at: string };

/**
 * AI 시즌 브리프 — **버튼 클릭 시점에만** 분석 트리거.
 * 상단바 버튼은 제거하고, 이 카드 내부의 버튼으로 일원화.
 * LLM 호출(`generate-season-brief` Edge Function)은 아직 미구현 → placeholder 응답.
 */
export default function AIBriefStubCard({ seasonName }: Props) {
  const [state, setState] = useState<State>({ kind: "idle" });

  const handleGenerate = () => {
    setState({ kind: "loading" });
    // 실제 Edge Function 연결 전까지 placeholder UX
    window.setTimeout(() => {
      setState({ kind: "placeholder", at: new Date().toLocaleTimeString("ko-KR") });
    }, 1200);
  };

  const isLoading = state.kind === "loading";

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-[color:var(--hotpack-trigger-high)]" aria-hidden />
          <div className="text-base font-semibold">AI 시즌 브리프</div>
          <span className="text-muted-foreground ml-auto text-xs">
            모델: Claude Sonnet 4.6 · 수동 생성
          </span>
        </div>

        <div className="text-muted-foreground space-y-1.5 text-sm leading-relaxed">
          <p>
            선택한 시즌(<span className="text-foreground font-medium">{seasonName ?? "–"}</span>)의
            판매·기온·키워드 데이터를 Claude가 분석한 리포트를 아래 버튼으로 생성합니다.
          </p>
          <p className="text-xs">
            <span className="font-medium">포함 항목</span>: 한 줄 요약 · 25시즌 대비 변화 · 첫
            돌파일 관찰 · 경보 포인트 · 다음 주 액션 (약 800자)
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={handleGenerate}
            disabled={isLoading || !seasonName}
            size="sm"
            className="h-9 gap-2 text-sm"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="h-4 w-4" aria-hidden />
            )}
            {isLoading ? "분석 중..." : "브리프 생성"}
          </Button>
          <span className="text-muted-foreground text-xs">
            rate limit 10분 1회 · 주간 cron 자동 갱신 예정
          </span>
        </div>

        {/* 결과 영역 */}
        {state.kind !== "idle" && (
          <div
            className={cn(
              "bg-muted/40 mt-1 rounded-md border p-4 text-sm",
              state.kind === "loading" && "animate-pulse"
            )}
          >
            {state.kind === "loading" && (
              <span className="text-muted-foreground">
                Claude가 {seasonName} 데이터를 분석하고 있습니다…
              </span>
            )}
            {state.kind === "placeholder" && (
              <div className="space-y-2">
                <div className="text-muted-foreground text-xs">
                  생성 시각 {state.at} · 모델 stub
                </div>
                <p className="leading-relaxed">
                  🚧{" "}
                  <span className="font-medium">
                    Edge Function 준비 중 (아직 실제 LLM 호출 안 됨)
                  </span>
                  . `generate-season-brief` 함수와 `hotpack_llm_reports` 테이블 생성 후 이 자리에
                  실제 Claude Sonnet 4.6 응답이 800자 한국어 리포트로 표시됩니다.
                </p>
                <p className="text-muted-foreground text-xs">
                  구현 스펙은 `docs/HOTPACK_DASHBOARD_LAYOUT.md §11.2` 참조.
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
