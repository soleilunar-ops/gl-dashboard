// 변경 이유: 시연 더미를 제거하고, 기간 CSV를 DB 센터 라인·메모까지 포함하도록 했습니다.
"use client";

import { useCallback, useEffect, useState } from "react";
import { format, parseISO, startOfMonth } from "date-fns";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { todayKstYmdDash } from "@/lib/kma-time";
import {
  useMilkrunAllocations,
  type MilkrunDailyRow,
  type MilkrunDetail,
  type MilkrunHistoryRecord,
  type MilkrunHistorySummary,
} from "@/components/logistics/_hooks/useMilkrunAllocations";

function formatInt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("ko-KR");
}

function csvEscape(value: string): string {
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export default function MilkrunHistoryTab() {
  const { listByRange, listLinesForCsvExport, getDetail, remove } = useMilkrunAllocations();
  const endDefault = todayKstYmdDash();
  const startDefault = format(startOfMonth(parseISO(`${endDefault}T12:00:00+09:00`)), "yyyy-MM-dd");

  const [start, setStart] = useState(startDefault);
  const [end, setEnd] = useState(endDefault);
  const [summary, setSummary] = useState<MilkrunHistorySummary | null>(null);
  const [records, setRecords] = useState<MilkrunHistoryRecord[]>([]);
  const [daily, setDaily] = useState<MilkrunDailyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);
  const [noDb, setNoDb] = useState(false);

  const [detail, setDetail] = useState<MilkrunDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<MilkrunHistoryRecord | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setNoDb(false);
    try {
      const res = await listByRange(start, end);
      if (!res.ok) {
        if (res.missingTable) {
          setNoDb(true);
          setSummary(null);
          setRecords([]);
          setDaily([]);
          return;
        }
        toast.error(res.message);
        return;
      }
      setNoDb(false);
      setSummary(res.summary);
      setRecords(res.records);
      setDaily(res.daily);
    } catch {
      toast.error("네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [start, end, listByRange]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (id: number) => {
    try {
      const res = await getDetail(id);
      if (!res.ok) {
        if (res.missingTable) {
          toast.error("Supabase allocations 테이블을 찾을 수 없습니다. 마이그레이션을 적용하세요.");
        } else {
          toast.error(res.message);
        }
        return;
      }
      setDetail(res.detail);
      setDetailOpen(true);
    } catch {
      toast.error("네트워크 오류");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await remove(deleteTarget.id);
      if (!res.ok) {
        if (res.missingTable) {
          toast.error("Supabase allocations 테이블을 찾을 수 없습니다. 마이그레이션을 적용하세요.");
        } else {
          toast.error(res.message);
        }
        return;
      }
      toast.success("삭제되었습니다.");
      setDeleteTarget(null);
      void load();
    } catch {
      toast.error("네트워크 오류");
    }
  };

  const downloadPeriodCsv = async () => {
    setCsvLoading(true);
    try {
      const res = await listLinesForCsvExport(start, end);
      if (!res.ok) {
        if (res.missingTable) {
          toast.error("Supabase 테이블을 찾을 수 없습니다. 마이그레이션을 적용하세요.");
        } else {
          toast.error(res.message);
        }
        return;
      }
      if (res.lines.length === 0) {
        toast.message("이 기간에 내보낼 센터 라인이 없습니다.");
        return;
      }
      const header =
        "배정ID,출고일,저장일시(UTC),메모,센터명,BASIC_VAT별도,파렛트,라인금액_VAT별도,비중_pct";
      const lines = [header];
      for (const row of res.lines) {
        const memo = row.memo?.trim() ? row.memo : "";
        lines.push(
          [
            String(row.allocationId),
            csvEscape(row.orderDate),
            csvEscape(row.createdAt),
            csvEscape(memo),
            csvEscape(row.centerName),
            String(row.basicPrice),
            String(row.palletCount),
            String(row.lineCost),
            String(row.sharePct),
          ].join(",")
        );
      }
      const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `milkrun-detail-${start}-${end}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`센터별 ${res.lines.length}행을 CSV로 저장했습니다.`);
    } catch {
      toast.error("CSV 생성에 실패했습니다.");
    } finally {
      setCsvLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-muted/40 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm">
        <Badge variant="outline">Supabase 저장 배정</Badge>
        <span className="text-muted-foreground hidden sm:inline">
          데이터는 public.allocations / allocation_items에서 불러옵니다.
        </span>
      </div>

      {noDb && (
        <Card className="border-amber-500/40">
          <CardContent className="text-muted-foreground pt-6 text-sm">
            Supabase에 public.allocations / allocation_items가 없거나 조회할 수 없습니다. 프로젝트의
            supabase/migrations를 적용하거나 대시보드 SQL로 동일 DDL을 실행한 뒤 「조회」를 다시
            누르세요.
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <Label>시작일</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="font-normal">
                {start}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={parseISO(`${start}T12:00:00+09:00`)}
                onSelect={(d) => d && setStart(format(d, "yyyy-MM-dd"))}
              />
            </PopoverContent>
          </Popover>
        </div>
        <div className="grid gap-1">
          <Label>종료일</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="font-normal">
                {end}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={parseISO(`${end}T12:00:00+09:00`)}
                onSelect={(d) => d && setEnd(format(d, "yyyy-MM-dd"))}
              />
            </PopoverContent>
          </Popover>
        </div>
        <Button type="button" onClick={() => void load()} disabled={loading}>
          조회
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void downloadPeriodCsv()}
          disabled={noDb || records.length === 0 || csvLoading}
        >
          {csvLoading ? "CSV 준비 중…" : "CSV 다운로드 (센터별)"}
        </Button>
      </div>

      {!noDb && summary && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-6 text-sm">저장 건수</CardContent>
            <CardContent className="text-2xl font-semibold [font-variant-numeric:tabular-nums]">
              {formatInt(summary.count)}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-sm">총 파렛트</CardContent>
            <CardContent className="text-2xl font-semibold [font-variant-numeric:tabular-nums]">
              {formatInt(summary.totalPallets)}
            </CardContent>
          </Card>
          <Card className="border-primary/30 lg:col-span-1">
            <CardContent className="pt-6 text-sm">총 비용 (VAT 별도)</CardContent>
            <CardContent className="text-primary text-3xl font-bold [font-variant-numeric:tabular-nums]">
              {formatInt(summary.totalCost)}원
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-sm">평균 건당 비용</CardContent>
            <CardContent className="text-2xl font-semibold [font-variant-numeric:tabular-nums]">
              {formatInt(summary.avgCostPerRecord)}원
            </CardContent>
          </Card>
        </div>
      )}

      {!noDb && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground mb-2 text-sm">일별 비용 추이</p>
            <div className="h-[280px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatInt(Number(v))} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.[0]) return null;
                      const row = payload[0].payload as MilkrunDailyRow;
                      return (
                        <div className="bg-background rounded-md border px-2 py-1.5 text-xs shadow-sm">
                          <div className="font-medium">{String(label)}</div>
                          <div>{`비용 ${formatInt(row.cost)}원`}</div>
                          <div>{`파렛트 ${formatInt(row.pallets)}개`}</div>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="cost" name="비용" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {!noDb && (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>출고일</TableHead>
                <TableHead className="text-right">센터 수</TableHead>
                <TableHead className="text-right">파렛트</TableHead>
                <TableHead className="text-right">총 비용</TableHead>
                <TableHead>메모</TableHead>
                <TableHead />
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="[font-variant-numeric:tabular-nums]">
                    {r.orderDate}
                  </TableCell>
                  <TableCell className="text-right">{formatInt(r.centerCount)}</TableCell>
                  <TableCell className="text-right">{formatInt(r.totalPallets)}</TableCell>
                  <TableCell className="text-right font-medium">{`${formatInt(r.totalCost)}원`}</TableCell>
                  <TableCell className="text-muted-foreground max-w-[200px] truncate">
                    {r.memo?.trim() ? r.memo : "—"}
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void openDetail(r.id)}
                    >
                      상세
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteTarget(r)}
                    >
                      삭제
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {records.length === 0 && (
            <p className="text-muted-foreground p-6 text-center text-sm">저장된 배정이 없습니다.</p>
          )}
        </div>
      )}

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>배정 상세</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              <p>{`출고일 ${detail.orderDate} · 총 ${formatInt(detail.totalCost)}원 · 파렛트 ${formatInt(detail.totalPallets)}개`}</p>
              {detail.memo?.trim() ? (
                <p className="text-muted-foreground">{`메모: ${detail.memo}`}</p>
              ) : null}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>센터</TableHead>
                    <TableHead className="text-right">BASIC</TableHead>
                    <TableHead className="text-right">파렛트</TableHead>
                    <TableHead className="text-right">금액</TableHead>
                    <TableHead className="text-right">비중</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.items.map((it) => (
                    <TableRow key={it.centerName}>
                      <TableCell>{it.centerName}</TableCell>
                      <TableCell className="text-right">{formatInt(it.basicPrice)}원</TableCell>
                      <TableCell className="text-right">{formatInt(it.palletCount)}</TableCell>
                      <TableCell className="text-right">{formatInt(it.lineCost)}원</TableCell>
                      <TableCell className="text-right">{`${it.sharePct}%`}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>삭제 확인</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            {deleteTarget
              ? `출고일 ${deleteTarget.orderDate} 배정을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`
              : ""}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
              취소
            </Button>
            <Button type="button" variant="destructive" onClick={() => void confirmDelete()}>
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
