"use client";

import { MoreHorizontal, RefreshCw } from "lucide-react";
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

/**
 * 상단바 ⋯ 팝오버. cron 잡 4종 상태 + 수동 리프레시.
 * M2: 상태 표시 + "지금 전체 리페치" 버튼.
 * M6+: "지금 동기화" Edge Function POST 추가 예정.
 */
export default function AdminPopover() {
  const { data, loading, refetch } = useDataHealth();

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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
