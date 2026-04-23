"use client";

import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

/**
 * 답변 모델 선택 드롭다운.
 * 크림 배경 + 테마 컬러 — 네이티브 select의 OS 기본 UI를 피하기 위해 shadcn Select 사용.
 */
export function ModelPicker({ value, onChange, disabled }: ModelPickerProps) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        aria-label="답변 모델 선택"
        className="h-8 gap-1.5 border-[#F9DB94] bg-[#FDF3D0] px-3 text-xs font-medium text-[#8A6A1F] shadow-none hover:bg-[#FAE8B8] focus:ring-[#E3A83E] focus-visible:ring-[#E3A83E]/50 data-[placeholder]:text-[#8A6A1F]"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="border-[#F9DB94] bg-[#FDF3D0] ring-[#F9DB94]/40">
        {HARURU_MODELS.map((m) => (
          <SelectItem
            key={m.id}
            value={m.id}
            className="text-xs text-[#8A6A1F] focus:bg-[#FAE8B8] focus:text-[#8A6A1F] data-[state=checked]:bg-[#FAE8B8]"
          >
            {m.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
