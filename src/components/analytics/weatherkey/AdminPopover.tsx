"use client";

import { Calendar, MoreHorizontal, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDataHealth } from "./_hooks/useDataHealth";
import { useMockDate } from "./_hooks/useMockDate";

/**
 * 상단바 ⋯ 팝오버. cron 잡 4종 상태 + 수동 리프레시.
 * M2: 상태 표시 + "지금 전체 리페치" 버튼.
 * M6+: "지금 동기화" Edge Function POST 추가 예정.
 */
export default function AdminPopover() {
  const { data, loading, refetch } = useDataHealth();
  const { mockDate, setMockDate, enabled: mockEnabled } = useMockDate();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="관리자 메뉴">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="text-xs">데이터 소스 최신성</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {loading ? (
          <DropdownMenuItem disabled className="text-xs">
            로딩 중…
          </DropdownMenuItem>
        ) : data.freshness.length === 0 ? (
          <DropdownMenuItem disabled className="text-xs">
            기록 없음
          </DropdownMenuItem>
        ) : (
          data.freshness.map((f, i) => (
            <DropdownMenuItem key={`${f.source ?? i}`} disabled className="text-xs tabular-nums">
              <span className="mr-2 w-24 font-medium">{f.source ?? "?"}</span>
              <span className="text-muted-foreground">{f.latest_date ?? "-"}</span>
              <span className="ml-auto">{f.days_behind ?? "?"}일</span>
            </DropdownMenuItem>
          ))
        )}

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs">Cron 잡 상태</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {data.cronJobs.length === 0 ? (
          <DropdownMenuItem disabled className="text-xs">
            기록 없음
          </DropdownMenuItem>
        ) : (
          data.cronJobs.map((j) => (
            <DropdownMenuItem key={j.jobid ?? j.jobname} disabled className="text-xs">
              <span className="mr-2 w-32 truncate font-medium">{j.jobname}</span>
              <span
                className={
                  j.last_status === "succeeded"
                    ? "text-[color:var(--hotpack-health-good)]"
                    : "text-destructive"
                }
              >
                {j.last_status ?? "-"}
              </span>
              <span className="text-muted-foreground ml-auto">
                {j.last_run ? new Date(j.last_run).toLocaleDateString("ko-KR") : "-"}
              </span>
            </DropdownMenuItem>
          ))
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => refetch()} className="text-xs">
          <RefreshCw className="mr-2 h-3.5 w-3.5" /> 상태 다시 불러오기
        </DropdownMenuItem>

        {mockEnabled && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="flex items-center gap-1.5 text-xs">
              <Calendar className="h-3.5 w-3.5" /> 개발 · Mock Date
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div
              className="flex flex-col gap-2 px-2 py-2"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <input
                type="date"
                value={mockDate ?? ""}
                onChange={(e) => setMockDate(e.target.value || null)}
                className="border-input bg-background w-full rounded-md border px-2 py-1 text-xs"
              />
              <div className="flex flex-wrap gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => setMockDate("2026-12-04")}
                >
                  12/4 시뮬
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => setMockDate("2026-12-08")}
                >
                  12/8 추위 당일
                </Button>
                {mockDate && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-[11px]"
                    onClick={() => setMockDate(null)}
                  >
                    <X className="h-3 w-3" /> 해제
                  </Button>
                )}
              </div>
              <div className="text-muted-foreground text-[10px] leading-relaxed">
                {mockDate ? (
                  <>
                    ⚠️ 현재 <b>{mockDate}</b>로 위장 중 — 예보 스캔·10일 창이 이 날짜 기준으로
                    작동합니다.
                  </>
                ) : (
                  <>실제 날짜 사용 중. 프로덕션 빌드에선 이 블록이 감춰집니다.</>
                )}
              </div>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
