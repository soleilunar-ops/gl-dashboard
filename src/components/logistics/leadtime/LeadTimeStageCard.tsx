import { ChevronRight, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
        <p className="text-xs font-medium">{label}</p>
        {db !== 1 ? (
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">예상</span>
            <Input
              type="date"
              className="text-xs"
              value={draftExpected}
              onChange={(e) => onDraftExpectedChange(e.target.value)}
            />
            {db === 3 && shanghaiHint ? (
              <p className="text-muted-foreground text-[0.65rem] leading-snug">
                미입력 시 참고: {shanghaiHint} (입항 예정−해상일)
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">실제</span>
          <Input
            type="date"
            className="text-xs"
            value={draftDate}
            onChange={(e) => onDraftDateChange(e.target.value)}
          />
          {showDelay ? <DelayBadge actual={draftDate} expected={expectedForBadge} /> : null}
        </div>
        {db === 1 ? (
          <div className="border-border mt-2 space-y-2 border-t pt-2">
            <Label className="text-xs">BL번호 (M/HBL)</Label>
            <p className="text-muted-foreground text-[0.65rem] leading-snug">
              유니패스 화물통관 + 공공데이터포털 외항반출입으로 일부 자동 반영됩니다.
            </p>
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
                조회는 완료됐지만 유니패스·외항반출입 API에서 선박/일정을 받지 못했습니다.{" "}
                <code className="text-[0.7rem]">UNIPASS_API_KEY</code>·BL을 확인하고, 입항 예정은{" "}
                <code className="text-[0.7rem]">PUBLIC_DATA_API_KEY</code>와 호출부호(
                <code className="text-[0.7rem]">clsgn</code>, 인천 등은{" "}
                <code className="text-[0.7rem]">PUBLIC_DATA_PRT_AG_CD</code>)를 확인해 주세요.
              </p>
            ) : null}
            {blMessage === "fail" ? (
              <p className="text-destructive text-xs">조회 실패, 수동 입력 필요</p>
            ) : null}
          </div>
        ) : null}
        {db === 4 && row.tracking_status ? (
          <Badge variant="outline" className="mt-1 w-fit text-xs">
            {row.tracking_status}
          </Badge>
        ) : null}
      </div>
      {!isLast ? (
        <div className="text-muted-foreground flex shrink-0 items-center px-0.5">
          <ChevronRight className="h-4 w-4" />
        </div>
      ) : null}
    </div>
  );
}
