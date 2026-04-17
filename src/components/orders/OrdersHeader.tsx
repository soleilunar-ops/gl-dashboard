"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import type { Tables } from "@/lib/supabase/types";
import type { OrderErpSystem, OrderStatus, OrderTxType } from "./_hooks/useOrders";

type SummaryRow = Tables<"v_orders_summary">;

interface Props {
  status: OrderStatus;
  onStatusChange: (status: OrderStatus) => void; // eslint-disable-line no-unused-vars -- 시그니처용 매개변수명
  erpSystems: OrderErpSystem[];
  onErpSystemsChange: (vals: OrderErpSystem[]) => void; // eslint-disable-line no-unused-vars -- 시그니처용 매개변수명
  txTypes: OrderTxType[];
  onTxTypesChange: (vals: OrderTxType[]) => void; // eslint-disable-line no-unused-vars -- 시그니처용 매개변수명
  itemSearch: string;
  onItemSearchChange: (val: string) => void; // eslint-disable-line no-unused-vars -- 시그니처용 매개변수명
  dateFrom: string | null;
  dateTo: string | null;
  onDateChange: (from: string | null, to: string | null) => void; // eslint-disable-line no-unused-vars -- 시그니처용 매개변수명
}

const ERP_OPTIONS: { value: OrderErpSystem; label: string }[] = [
  { value: "gl", label: "지엘" },
  { value: "gl_pharm", label: "지엘팜" },
  { value: "hnb", label: "HNB" },
];

const TX_TYPE_GROUPS: { value: OrderTxType[]; label: string }[] = [
  { value: ["purchase"], label: "구매" },
  { value: ["sale"], label: "판매" },
  { value: ["return_sale", "return_purchase"], label: "반품" },
];

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDate(d);
}

const DATE_PRESETS: { label: string; compute: () => [string | null, string | null] }[] = [
  { label: "최근 1주", compute: () => [daysAgo(7), isoDate(new Date())] },
  { label: "최근 1개월", compute: () => [daysAgo(30), isoDate(new Date())] },
  { label: "최근 3개월", compute: () => [daysAgo(90), isoDate(new Date())] },
  {
    label: "이번 분기",
    compute: () => {
      const d = new Date();
      const q = Math.floor(d.getMonth() / 3);
      const from = new Date(d.getFullYear(), q * 3, 1);
      return [isoDate(from), isoDate(new Date())];
    },
  },
  {
    label: "작년",
    compute: () => {
      const y = new Date().getFullYear() - 1;
      return [`${y}-01-01`, `${y}-12-31`];
    },
  },
  { label: "전체", compute: () => [null, null] },
];

/** 필터 + 카운트 카드 헤더 섹션 */
export function OrdersHeader({
  status,
  onStatusChange,
  erpSystems,
  onErpSystemsChange,
  txTypes,
  onTxTypesChange,
  itemSearch,
  onItemSearchChange,
  dateFrom,
  dateTo,
  onDateChange,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [summary, setSummary] = useState<SummaryRow | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [searchDraft, setSearchDraft] = useState(itemSearch);
  const [calendarOpen, setCalendarOpen] = useState(false);

  // 검색 디바운스
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchDraft !== itemSearch) onItemSearchChange(searchDraft);
    }, 300);
    return () => clearTimeout(t);
  }, [searchDraft, itemSearch, onItemSearchChange]);

  // 카운트 카드 조회 (전역 집계 — 필터 무관)
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setSummaryLoading(true);
      const { data, error } = await supabase.from("v_orders_summary").select("*").maybeSingle();
      if (cancelled) return;
      if (!error) setSummary(data as SummaryRow | null);
      setSummaryLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const showAll = status === "all";
  const selectedTxKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const g of TX_TYPE_GROUPS) {
      if (g.value.every((v) => txTypes.includes(v))) keys.add(g.label);
    }
    return [...keys];
  }, [txTypes]);

  const handleTxTypesChange = (labels: string[]) => {
    const next = new Set<OrderTxType>();
    for (const label of labels) {
      const g = TX_TYPE_GROUPS.find((item) => item.label === label);
      if (g) g.value.forEach((v) => next.add(v));
    }
    onTxTypesChange([...next]);
  };

  return (
    <div className="space-y-3">
      {/* 카운트 카드 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CountCard label="전체" value={summary?.total_count} loading={summaryLoading} />
        <CountCard
          label="승인대기"
          value={summary?.pending_count}
          loading={summaryLoading}
          emphasis
        />
        <CountCard label="승인완료" value={summary?.approved_count} loading={summaryLoading} />
        <CountCard label="거절" value={summary?.rejected_count} loading={summaryLoading} />
      </div>

      {/* 상태 탭 + 전체 보기 토글 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={status === "all" ? "pending" : status}
          onValueChange={(v) => onStatusChange(v as OrderStatus)}
        >
          <TabsList>
            <TabsTrigger value="pending">승인대기</TabsTrigger>
            <TabsTrigger value="approved">승인완료</TabsTrigger>
            <TabsTrigger value="rejected">거절</TabsTrigger>
          </TabsList>
        </Tabs>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={showAll}
            onCheckedChange={(checked) => onStatusChange(checked ? "all" : "pending")}
          />
          전체 보기
        </label>
      </div>

      {/* 필터 라인 */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 p-4">
          <div>
            <Label className="mb-1.5 block text-xs">기업</Label>
            <ToggleGroup
              type="multiple"
              value={erpSystems}
              onValueChange={(vals) => onErpSystemsChange(vals as OrderErpSystem[])}
            >
              {ERP_OPTIONS.map((opt) => (
                <ToggleGroupItem key={opt.value} value={opt.value} size="sm">
                  {opt.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">거래유형</Label>
            <ToggleGroup type="multiple" value={selectedTxKeys} onValueChange={handleTxTypesChange}>
              {TX_TYPE_GROUPS.map((g) => (
                <ToggleGroupItem key={g.label} value={g.label} size="sm">
                  {g.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="min-w-[200px] flex-1">
            <Label className="mb-1.5 block text-xs">품목 검색</Label>
            <div className="relative">
              <Search className="text-muted-foreground absolute top-2.5 left-2 h-4 w-4" />
              <Input
                className="pl-8"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                placeholder="품목명 또는 ERP 코드"
              />
            </div>
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">날짜</Label>
            <div className="flex items-center gap-2">
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="font-normal">
                    <CalendarDays className="mr-1 h-4 w-4" />
                    {dateFrom ?? "전체"} ~ {dateTo ?? "전체"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <div className="flex border-b">
                    {DATE_PRESETS.map((p) => (
                      <Button
                        key={p.label}
                        variant="ghost"
                        size="sm"
                        className="rounded-none"
                        onClick={() => {
                          const [from, to] = p.compute();
                          onDateChange(from, to);
                        }}
                      >
                        {p.label}
                      </Button>
                    ))}
                  </div>
                  <Calendar
                    mode="range"
                    selected={{
                      from: dateFrom ? new Date(dateFrom) : undefined,
                      to: dateTo ? new Date(dateTo) : undefined,
                    }}
                    onSelect={(range) => {
                      onDateChange(
                        range?.from ? isoDate(range.from) : null,
                        range?.to ? isoDate(range.to) : null
                      );
                    }}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CountCard({
  label,
  value,
  loading,
  emphasis,
}: {
  label: string;
  value: number | null | undefined;
  loading: boolean;
  emphasis?: boolean;
}) {
  return (
    <Card>
      <CardContent className={`p-4 ${emphasis ? "bg-primary/5" : ""}`}>
        <p className="text-muted-foreground text-xs">{label}</p>
        {loading ? (
          <Skeleton className="mt-1 h-7 w-20" />
        ) : (
          <p className="text-2xl font-semibold tabular-nums">
            {(value ?? 0).toLocaleString("ko-KR")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
