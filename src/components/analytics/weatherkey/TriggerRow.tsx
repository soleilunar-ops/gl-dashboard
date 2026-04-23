"use client";

import { cn } from "@/lib/utils";
import { TRIGGER_COLORS, TRIGGER_LABELS, type TriggerName } from "./_tokens";

const LEVEL_BG: Record<string, string> = {
  critical: "bg-[color:var(--hotpack-trigger-critical)]/10",
  high: "bg-[color:var(--hotpack-trigger-high)]/10",
  medium: "bg-[color:var(--hotpack-trigger-medium)]/10",
};

const LEVEL_BAR: Record<string, string> = {
  critical: "bg-[color:var(--hotpack-trigger-critical)]",
  high: "bg-[color:var(--hotpack-trigger-high)]",
  medium: "bg-[color:var(--hotpack-trigger-medium)]",
};

interface Props {
  trigger: TriggerName;
  variant: "today" | "tomorrow";
  detail?: string;
  /** compound=true인 경우 구성 트리거들 (cold_shock, first_freeze) */
  subTriggers?: TriggerName[];
  onClick?: () => void;
  isHighlighted?: boolean;
}

export default function TriggerRow({
  trigger,
  variant,
  detail,
  subTriggers,
  onClick,
  isHighlighted,
}: Props) {
  const { level } = TRIGGER_COLORS[trigger];
  const label = TRIGGER_LABELS[trigger];

  const content = (
    <>
      <span
        aria-hidden
        className={cn(
          "absolute top-0 left-0 h-full rounded-l-md",
          variant === "today" ? "w-1" : "w-0.5",
          LEVEL_BAR[level]
        )}
      />
      <span className="shrink-0 font-medium">{label}</span>
      {subTriggers && subTriggers.length > 0 && (
        <span className="flex gap-1">
          {subTriggers.map((t) => (
            <span key={t} className="text-muted-foreground rounded border px-1 text-[10px]">
              {TRIGGER_LABELS[t]}
            </span>
          ))}
        </span>
      )}
      {detail && (
        <span className="text-muted-foreground ml-auto truncate tabular-nums">{detail}</span>
      )}
    </>
  );

  const className = cn(
    "relative flex w-full items-center gap-2 overflow-hidden rounded-md border py-1.5 pr-2 pl-3 text-xs text-left transition-shadow",
    LEVEL_BG[level],
    isHighlighted && "ring-primary/60 ring-2",
    onClick && "hover:shadow-sm cursor-pointer"
  );

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} aria-pressed={isHighlighted}>
        {content}
      </button>
    );
  }
  return <div className={className}>{content}</div>;
}
