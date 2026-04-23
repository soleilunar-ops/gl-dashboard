"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface Props {
  seasonName: string | null;
}

type BriefJson = {
  kpis: {
    total_units_label: string;
    total_gmv_label: string;
    peak_units: number;
    peak_date_mmdd: string;
    r_log: number;
  };
  summary: { text: string; tag: string };
  baseline_change: {
    text: string;
    chips: Array<{ label: string; value: string }>;
  };
  first_breakthrough: { text: string; highlight: string };
  alerts: Array<{
    date: string;
    severity: "critical" | "high" | "medium";
    body: string;
  }>;
};

type Report = {
  id: string;
  season: string;
  kind: string;
  body_md: string;
  model: string;
  generated_at: string;
};

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "result"; report: Report; parsed: BriefJson; cached: boolean }
  | { kind: "error"; message: string };

function parseBrief(body: string): BriefJson | null {
  try {
    return JSON.parse(body) as BriefJson;
  } catch {
    return null;
  }
}

export default function AIBriefStubCard({ seasonName }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<State>({ kind: "idle" });

  useEffect(() => {
    if (!seasonName) {
      setState({ kind: "idle" });
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("hotpack_llm_reports")
        .select("*")
        .eq("season", seasonName)
        .eq("kind", "season_brief")
        .order("generated_at", { ascending: false })
        .limit(1);
      if (cancelled) return;
      if (data && data.length > 0) {
        const rep = data[0] as Report;
        const parsed = parseBrief(rep.body_md);
        if (parsed) {
          setState({ kind: "result", report: rep, parsed, cached: true });
        } else {
          setState({ kind: "idle" });
        }
      } else {
        setState({ kind: "idle" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [seasonName, supabase]);

  const handleGenerate = useCallback(
    async (force = false) => {
      if (!seasonName) return;
      setState({ kind: "loading" });
      try {
        const { data, error } = await supabase.functions.invoke<{
          ok: boolean;
          cached?: boolean;
          report?: Report;
          parsed?: BriefJson;
          error?: string;
        }>("generate-season-brief", {
          body: { season: seasonName, force },
        });
        if (error) throw error;
        if (!data?.ok || !data.report) {
          throw new Error(data?.error ?? "Edge Function 응답 형식 오류");
        }
        const parsed = data.parsed ?? parseBrief(data.report.body_md);
        if (!parsed) throw new Error("JSON 파싱 실패");
        setState({
          kind: "result",
          report: data.report,
          parsed,
          cached: Boolean(data.cached),
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setState({ kind: "error", message });
      }
    },
    [seasonName, supabase]
  );

  const isLoading = state.kind === "loading";
  const result = state.kind === "result" ? state : null;

  return (
    <Card className="py-0">
      <CardContent className="flex flex-col gap-4 p-5">
        {/* 헤더 */}
        <div className="flex items-center justify-between gap-3">
          <div className="text-base font-semibold">AI 리포트</div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => handleGenerate(Boolean(result))}
              disabled={isLoading || !seasonName}
              size="sm"
              variant="outline"
              className="text-foreground bg-muted/40 h-8 gap-2 rounded-md border px-3 font-mono text-xs font-normal"
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              )}
              {isLoading ? "분석 중..." : "다시 생성"}
            </Button>
            <span className="text-foreground bg-muted/40 inline-flex h-8 items-center rounded-md border px-3 font-mono text-xs">
              {result ? result.report.model : "claude-sonnet-4-6"}
            </span>
          </div>
        </div>

        {result && (
          <div className="text-muted-foreground -mt-2 text-right text-xs">
            생성 {new Date(result.report.generated_at).toLocaleString("ko-KR")}
            {result.cached && " · 캐시"}
          </div>
        )}

        {state.kind === "loading" && (
          <div className="bg-muted/40 animate-pulse rounded-md border p-4 text-sm">
            Claude가 {seasonName} 데이터를 분석하고 있습니다…
          </div>
        )}

        {state.kind === "error" && (
          <div className="text-destructive bg-destructive/5 rounded-md border p-4 text-sm">
            <div className="mb-1 font-medium">생성 실패</div>
            <div className="text-xs">{state.message}</div>
          </div>
        )}

        {result && <BriefBody data={result.parsed} />}
      </CardContent>
    </Card>
  );
}

/* ─────────── 구조화 렌더 ─────────── */

function BriefBody({ data }: { data: BriefJson }) {
  return (
    <div className="flex flex-col gap-5">
      <KpiStrip k={data.kpis} />

      <Section num={1} title="한 줄 요약">
        <p className="text-sm leading-relaxed">
          {data.summary.text}{" "}
          <span className="text-foreground bg-muted ml-1 inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold">
            {data.summary.tag}
          </span>
        </p>
      </Section>

      <Section num={2} title="25시즌 대비 변화">
        <p className="text-muted-foreground mb-2 text-sm leading-relaxed">
          {data.baseline_change.text}
        </p>
        <div className="flex flex-wrap gap-2">
          {data.baseline_change.chips.map((c) => (
            <div
              key={c.label}
              className="text-foreground bg-muted inline-flex items-baseline gap-1.5 rounded-md px-3 py-1 text-xs font-semibold"
            >
              <span className="text-muted-foreground font-medium">{c.label}</span>
              <span className="tabular-nums">{c.value}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section num={3} title="첫 돌파일 관찰">
        <p className="text-sm leading-relaxed">{renderInlineCode(data.first_breakthrough.text)}</p>
        <div className="text-foreground bg-muted mt-2 inline-block rounded-md px-3 py-1.5 text-xs font-semibold">
          {data.first_breakthrough.highlight}
        </div>
      </Section>

      <Section num={4} title="경보 포인트">
        <div className="flex flex-col gap-2">
          {data.alerts.map((a, idx) => (
            <AlertCard key={idx} a={a} />
          ))}
        </div>
      </Section>
    </div>
  );
}

function KpiStrip({ k }: { k: BriefJson["kpis"] }) {
  const cards: Array<{ label: string; value: React.ReactNode; sublabel?: string }> = [
    { label: "시즌 총판매", value: k.total_units_label },
    { label: "총 매출", value: k.total_gmv_label },
    {
      label: "최고 판매일",
      value: `${k.peak_units.toLocaleString("ko-KR")}개`,
      sublabel: k.peak_date_mmdd,
    },
    { label: "기온-판매 연관도", value: k.r_log.toFixed(3) },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cards.map((c, i) => (
        <div key={i} className="bg-muted/20 rounded-md border px-3 py-3 text-center">
          <div className="text-muted-foreground text-[11px]">{c.label}</div>
          {/* sublabel 슬롯은 항상 렌더 — 카드 높이를 모두 동일하게 맞추기 위해 빈 값도  로 채움 */}
          <div className="text-muted-foreground mt-0.5 text-xs">{c.sublabel ?? " "}</div>
          <div className="mt-0.5 text-lg font-semibold tabular-nums">{c.value}</div>
        </div>
      ))}
    </div>
  );
}

function Section({
  num,
  title,
  children,
}: {
  num: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--hotpack-trigger-high)]/15 text-xs font-semibold text-[color:var(--hotpack-trigger-high)]">
        {num}
      </div>
      <div className="flex-1 space-y-1.5">
        <div className="text-sm font-semibold">{title}</div>
        <div>{children}</div>
      </div>
    </div>
  );
}

function AlertCard({ a }: { a: BriefJson["alerts"][0] }) {
  const dateColor =
    a.severity === "critical"
      ? "text-[color:var(--hotpack-trigger-critical)]"
      : a.severity === "high"
        ? "text-[color:var(--hotpack-trigger-high)]"
        : "text-muted-foreground";
  return (
    <div className="flex gap-3 rounded-md border border-[color:var(--hotpack-trigger-critical)]/20 bg-[color:var(--hotpack-trigger-critical)]/5 p-3">
      <div className={cn("w-20 shrink-0 text-xs font-semibold tabular-nums", dateColor)}>
        {a.date}
      </div>
      <div className="flex-1 text-sm leading-relaxed">{a.body}</div>
    </div>
  );
}

/**
 * 본문 안에 `code` 표기를 inline code 스타일로 렌더.
 */
function renderInlineCode(text: string): React.ReactNode {
  return text.split(/(`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="bg-muted rounded px-1 py-0.5 font-mono text-[11px]">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
