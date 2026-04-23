"use client";

// 저장된 주간 리포트 전체 목록 팝업. 클릭 시 해당 리포트 상세로 이동.
import Link from "next/link";
import { useWeeklyBriefList } from "@/lib/dashboard/weekly-brief/useWeeklyBriefList";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentReportId?: string;
}

function formatKoreanDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export function WeeklyBriefHistoryModal({ open, onOpenChange, currentReportId }: Props) {
  const { data, isLoading } = useWeeklyBriefList(30, open ? 1 : 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>저장된 주간 리포트</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground text-sm">
          최근 생성된 주간 리포트 목록입니다. 원하는 리포트를 선택하여 상세를 확인하세요.
        </p>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {isLoading && data.length === 0 && (
            <div className="text-muted-foreground py-8 text-center text-sm">불러오는 중...</div>
          )}
          {!isLoading && data.length === 0 && (
            <div className="text-muted-foreground py-8 text-center text-sm">
              아직 저장된 리포트가 없습니다.
            </div>
          )}
          {data.map((r) => {
            const ws = r.parsed?.metadata?.week_start ?? r.generated_at.slice(0, 10);
            const we = r.parsed?.metadata?.week_end ?? "";
            const headline = r.parsed?.insight?.headline ?? "리포트";
            const isCurrent = r.id === currentReportId;
            return (
              <Link
                key={r.id}
                href={`/dashboard?brief=${r.id}`}
                onClick={() => onOpenChange(false)}
                className={`block rounded-md border px-4 py-3 text-sm transition-colors ${
                  isCurrent
                    ? "border-[#F2BE5C] bg-[#FDF3D0]"
                    : "border-transparent hover:border-[#F9DB94] hover:bg-[#FDF3D0]/70"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-gray-900">
                    {ws} ~ {we}
                  </span>
                  <span className="text-xs text-gray-500">
                    생성 {formatKoreanDate(r.generated_at)}
                  </span>
                </div>
                <div className="mt-1 line-clamp-2 text-xs text-gray-600">{headline}</div>
              </Link>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
