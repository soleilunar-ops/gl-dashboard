import { CalendarDays, ChevronRight, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  getComputedShanghaiExpected,
  getExpectedValue,
  stepCardClass,
} from "@/lib/logistics/leadTimeCalc";
import { cn } from "@/lib/utils";

import type { LeadTimeRow, LeadtimeDbStep } from "../_hooks/useLeadTime";

import { DelayBadge } from "./DelayBadge";

type Props = {
  row: LeadTimeRow;
  db: LeadtimeDbStep;
  label: string;
  isLast: boolean;
  draftDate: string;
  draftExpected: string;
  onDraftDateChange: (next: string) => void;
  onDraftExpectedChange: (next: string) => void;
  // BL 섹션 (db === 1 에서만 사용)
  blInput: string;
  onBlInputChange: (next: string) => void;
  blLookupLoading: boolean;
  blMessage: "ok" | "fail" | null;
  onBlLookup: () => void;
};

/** YYYY-MM-DD 문자열 → Date (로컬) */
function parseYmd(v: string): Date | undefined {
  if (!v) return undefined;
  const d = new Date(`${v}T12:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Date → YYYY-MM-DD (로컬) */
function formatYmd(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/** 커스텀 날짜 선택 버튼 + shadcn Calendar Popover */
function DatePickerButton({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  ariaLabel?: string;
}) {
  const selected = parseYmd(value);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={ariaLabel}
          className={cn(
            "h-9 w-full justify-between bg-white text-xs font-normal",
            !selected && "text-muted-foreground"
          )}
        >
          <span>{selected ? format(selected, "yyyy-MM-dd") : "연도-월-일"}</span>
          <CalendarDays className="h-3.5 w-3.5 shrink-0 opacity-70" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={ko}
          selected={selected}
          onSelect={(d) => {
            if (d) onChange(formatYmd(d));
          }}
          numberOfMonths={1}
        />
      </PopoverContent>
    </Popover>
  );
}

export function LeadTimeStageCard({
  row,
  db,
  label,
  isLast,
  draftDate,
  draftExpected,
  onDraftDateChange,
  onDraftExpectedChange,
  blInput,
  onBlInputChange,
  blLookupLoading,
  blMessage,
  onBlLookup,
}: Props) {
  const expectedForBadge = db === 1 ? null : draftExpected.trim() || getExpectedValue(row, db);
  const shanghaiHint = db === 3 && !draftExpected.trim() ? getComputedShanghaiExpected(row) : null;
  const showDelay = db !== 1 && !!expectedForBadge && !!draftDate;

  return (
    <div className="flex min-w-0 flex-1 items-stretch gap-1">
      <div
        className={cn("flex flex-1 flex-col gap-2 rounded-lg border p-3", stepCardClass(row, db))}
      >
        {/* 카드 제목 — 가운데 정렬 + 키움 */}
        <p className="text-center text-sm font-semibold">{label}</p>

        {/* 상단 섹션 — 고정 높이로 4개 카드의 "실제" Y 좌표 정렬 */}
        <div className="flex flex-col gap-1" style={{ minHeight: 90 }}>
          {db === 1 ? (
            <>
              <span className="text-muted-foreground text-xs">BL번호 (M/HBL)</span>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  placeholder="예: COSU1234567890"
                  value={blInput}
                  onChange={(e) => onBlInputChange(e.target.value)}
                  className="min-w-[140px] flex-1 text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={blLookupLoading}
                  onClick={onBlLookup}
                >
                  {blLookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "조회"}
                </Button>
              </div>
              {row.vessel_name ? (
                <p className="text-xs text-green-600">선박명: {row.vessel_name}</p>
              ) : null}
              {blMessage === "ok" &&
              !row.vessel_name &&
              !row.step4_expected &&
              !row.step4_actual &&
              !row.tracking_status ? (
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  조회는 완료됐지만 유니패스·외항반출입 API에서 선박/일정을 받지 못했습니다.
                </p>
              ) : null}
              {blMessage === "fail" ? (
                <p className="text-destructive text-xs">조회 실패, 수동 입력 필요</p>
              ) : null}
            </>
          ) : (
            <>
              <span className="text-muted-foreground text-xs">예상</span>
              <DatePickerButton
                value={draftExpected}
                onChange={onDraftExpectedChange}
                ariaLabel={`${label} 예상 날짜`}
              />
              {db === 3 && shanghaiHint ? (
                <p className="text-muted-foreground text-[0.65rem] leading-snug">
                  미입력 시 참고: {shanghaiHint} (입항 예정−해상일)
                </p>
              ) : null}
            </>
          )}
        </div>

        {/* 하단 섹션 — "실제" 입력 (상단 바로 아래, 간격 좁게) */}
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">실제</span>
          <DatePickerButton
            value={draftDate}
            onChange={onDraftDateChange}
            ariaLabel={`${label} 실제 날짜`}
          />
          {db === 4 ? (
            <div className="flex flex-wrap items-center gap-2">
              {row.tracking_status ? (
                <Badge variant="outline" className="text-xs">
                  {row.tracking_status}
                </Badge>
              ) : null}
              {showDelay ? <DelayBadge actual={draftDate} expected={expectedForBadge} /> : null}
            </div>
          ) : (
            showDelay && <DelayBadge actual={draftDate} expected={expectedForBadge} />
          )}
        </div>
      </div>
      {!isLast ? (
        <div className="text-muted-foreground flex shrink-0 items-center px-0.5">
          <ChevronRight className="h-4 w-4" />
        </div>
      ) : null}
    </div>
  );
}
