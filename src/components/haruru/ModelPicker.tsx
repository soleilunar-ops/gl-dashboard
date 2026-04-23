"use client";

import { useEffect, useState } from "react";
import { Cpu } from "lucide-react";
import { cn } from "@/lib/utils";

export const HARURU_MODELS = [
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", hint: "빠름·저렴" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", hint: "기본·균형" },
  { id: "claude-opus-4-7", label: "Claude Opus 4.7", hint: "최고 정확도" },
  { id: "gpt-4o", label: "GPT-4o", hint: "OpenAI 범용" },
  { id: "gpt-4o-mini", label: "GPT-4o mini", hint: "OpenAI 저렴" },
] as const;

const STORAGE_KEY = "haruru_model";
const DEFAULT_MODEL = "claude-sonnet-4-6";

export function useModelPicker() {
  const [model, setModel] = useState<string>(DEFAULT_MODEL);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (saved && HARURU_MODELS.some((m) => m.id === saved)) setModel(saved);
  }, []);

  const update = (next: string) => {
    setModel(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  };

  return { model, setModel: update };
}

interface ModelPickerProps {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}

export function ModelPicker({ value, onChange, disabled }: ModelPickerProps) {
  const current = HARURU_MODELS.find((m) => m.id === value) ?? HARURU_MODELS[1];
  return (
    <div className="flex items-center gap-2 text-xs text-gray-500">
      <Cpu className="h-3.5 w-3.5" />
      <label className="flex items-center gap-1.5">
        <span>모델</span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={cn(
            "rounded border border-orange-200 bg-white px-2 py-0.5 text-xs",
            "focus:border-orange-400 focus:outline-none",
            disabled && "opacity-50"
          )}
          aria-label="답변 모델 선택"
        >
          {HARURU_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} ({m.hint})
            </option>
          ))}
        </select>
      </label>
      <span className="text-gray-400">{current.hint}</span>
    </div>
  );
}
