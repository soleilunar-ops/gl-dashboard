"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ORDER_COMPANIES, type OrderCompanyCode } from "@/lib/orders/orderMeta";
import type { OrderErpSystem } from "./_hooks/useOrders";
import type { OrderErpDealKind } from "./OrderErpSyncPanel";

/** 거래유형 버튼 고정 순서 */
const ALL_DEAL_KINDS: OrderErpDealKind[] = ["purchase", "sales", "returns", "production"];

interface Props {
  /** 상단 카드에서 허용된 기업(목록 버튼은 항상 노출, 여기 없으면 비활성) */
  listScopeCompanies: OrderCompanyCode[];
  /** 상단 카드에서 허용된 거래유형(목록 버튼은 항상 노출, 여기 없으면 비활성) */
  listScopeDealKinds: OrderErpDealKind[];
  /** 목록 조회에 쓸 기업(비어 있으면 상단 범위 전체와 동일) */
  narrowCompanies: OrderErpSystem[];
  /** 목록 조회에 쓸 거래유형(비어 있으면 상단 범위 전체와 동일) */
  narrowDealKinds: OrderErpDealKind[];
  onToggleNarrowCompany: (code: OrderErpSystem) => void;
  onToggleNarrowDealKind: (kind: OrderErpDealKind) => void;
  itemSearch: string;
  onItemSearchChange: (val: string) => void;
  dateFrom: string | null;
  dateTo: string | null;
  onDateChange: (from: string | null, to: string | null) => void;
  variant?: "card" | "embedded";
  hideEmbeddedLabel?: boolean;
}

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

/** 거래유형 토글 라벨(상단 카드와 동일) */
function dealKindLabel(kind: OrderErpDealKind): string {
  if (kind === "purchase") return "구매";
  if (kind === "sales") return "판매";
  if (kind === "production") return "생산입고";
  return "반품";
}

/** 상단 범위에 속하는 버튼만 조작 가능 · 좁히기 비어 있으면 범위 전체 조회 */
function chipVariant(
  inScope: boolean,
  narrowEmpty: boolean,
  inNarrow: boolean
): "secondary" | "outline" {
  if (!inScope) return "outline";
  if (narrowEmpty) return "secondary";
  return inNarrow ? "secondary" : "outline";
}

/** 목록 필터 — 기업·거래유형 버튼 상시 노출, 상단 선택 반영 후 추가 클릭으로 조회 범위 축소 */
export function OrdersListFilters({
  listScopeCompanies,
  listScopeDealKinds,
  narrowCompanies,
  narrowDealKinds,
  onToggleNarrowCompany,
  onToggleNarrowDealKind,
  itemSearch,
  onItemSearchChange,
  dateFrom,
  dateTo,
  onDateChange,
  variant = "card",
  hideEmbeddedLabel = false,
}: Props) {
  const [searchDraft, setSearchDraft] = useState(itemSearch);
  const [calendarOpen, setCalendarOpen] = useState(false);

  useEffect(() => {
    setSearchDraft(itemSearch);
  }, [itemSearch]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchDraft !== itemSearch) onItemSearchChange(searchDraft);
    }, 300);
    return () => clearTimeout(t);
  }, [searchDraft, itemSearch, onItemSearchChange]);

  const inner = (
    <>
      <div>
        <Label className="mb-1.5 block text-xs">기업</Label>
        <div className="flex flex-wrap gap-1">
          {ORDER_COMPANIES.map(({ code, label }) => {
            const inScope = listScopeCompanies.includes(code);
            const narrowEmpty = narrowCompanies.length === 0;
            const inNarrow = narrowCompanies.includes(code);
            return (
              <Button
                key={code}
                type="button"
                disabled={!inScope}
                variant={chipVariant(inScope, narrowEmpty, inNarrow)}
                size="sm"
                className="h-7 shrink-0 px-2.5 text-[0.8rem]"
                onClick={() => onToggleNarrowCompany(code)}
              >
                {label}
              </Button>
            );
          })}
        </div>
      </div>
      <div>
        <Label className="mb-1.5 block text-xs">거래유형</Label>
        <div className="flex flex-wrap gap-1">
          {ALL_DEAL_KINDS.map((kind) => {
            const inScope = listScopeDealKinds.includes(kind);
            const narrowEmpty = narrowDealKinds.length === 0;
            const inNarrow = narrowDealKinds.includes(kind);
            return (
              <Button
                key={kind}
                type="button"
                disabled={!inScope}
                variant={chipVariant(inScope, narrowEmpty, inNarrow)}
                size="sm"
                className="h-7 shrink-0 px-2.5 text-[0.8rem]"
                onClick={() => onToggleNarrowDealKind(kind)}
              >
                {dealKindLabel(kind)}
              </Button>
            );
          })}
        </div>
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
        <Label className="mb-1.5 block text-xs">기간</Label>
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
    </>
  );

  if (variant === "embedded") {
    return (
      <div className="border-muted space-y-2 border-t pt-3">
        {!hideEmbeddedLabel ? (
          <p className="text-muted-foreground text-xs font-medium">목록 필터</p>
        ) : null}
        <div className="flex flex-wrap items-end gap-4">{inner}</div>
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-4 p-4">{inner}</CardContent>
    </Card>
  );
}
