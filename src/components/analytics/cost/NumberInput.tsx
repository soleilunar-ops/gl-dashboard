"use client";

import { type Dispatch, type SetStateAction } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface NumberInputProps {
  label: string;
  value: number;
  onChange: Dispatch<SetStateAction<number>>;
  step?: string;
}

export function NumberInput({ label, value, onChange, step = "1" }: NumberInputProps) {
  return (
    <label className="space-y-1">
      <span className="text-muted-foreground text-xs">
        <span className="text-[10px] font-medium text-sky-700 dark:text-sky-400">입력</span> {label}
      </span>
      <Input
        type="number"
        value={value}
        step={step}
        onChange={(event) => {
          const next = Number(event.target.value);
          onChange(Number.isFinite(next) ? next : 0);
        }}
      />
    </label>
  );
}

export function IoBlockHeader({ variant, title }: { variant: "in" | "out"; title: string }) {
  return (
    <div className="border-border mb-3 flex items-center gap-2 border-b pb-2">
      <Badge variant={variant === "in" ? "outline" : "secondary"} className="shrink-0">
        {variant === "in" ? "입력" : "산출"}
      </Badge>
      <span className="text-sm font-semibold">{title}</span>
    </div>
  );
}

export function OutputMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background/80 rounded-md border px-3 py-2">
      <p className="text-muted-foreground text-[11px] leading-tight">{label}</p>
      <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}
