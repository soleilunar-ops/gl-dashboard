"use client";

import { Calendar } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSeasonList } from "./_hooks/useSeasonList";

interface Props {
  value: string | null;
  onChange: (season: string) => void;
}

function statusLabel(is_closed: boolean | null): string {
  return is_closed ? "종료" : "진행·예정";
}

/**
 * 시즌 드롭다운. 옵션은 `season_config` 전체 (start_date DESC).
 * 값이 null이면 placeholder 표시.
 */
export default function SeasonSelect({ value, onChange }: Props) {
  const { data, loading } = useSeasonList();

  return (
    <Select value={value ?? undefined} onValueChange={onChange} disabled={loading}>
      <SelectTrigger className="h-8 w-[140px] text-xs">
        <Calendar className="text-muted-foreground mr-1 h-3.5 w-3.5" aria-hidden />
        <SelectValue placeholder={loading ? "로딩…" : "시즌 선택"} />
      </SelectTrigger>
      <SelectContent>
        {data.map((s) => (
          <SelectItem key={s.season} value={s.season} className="text-xs">
            <span className="font-medium">{s.season}</span>
            <span className="text-muted-foreground ml-2">{statusLabel(s.is_closed)}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
