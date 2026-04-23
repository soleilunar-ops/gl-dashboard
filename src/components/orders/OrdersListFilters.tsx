"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ORDER_COMPANIES, type OrderCompanyCode } from "@/lib/orders/orderMeta";
import type { OrderErpSystem, OrderStatus } from "./_hooks/useOrders";
import type { OrderErpDealKind } from "./OrderErpSyncPanel";

/** 거래유형 버튼 고정 순서 — 변경 이유: 생산입고 필터 버튼 제거(후속 Supabase 테이블 매핑 시 정리) */
const ALL_DEAL_KINDS: OrderErpDealKind[] = ["purchase", "sales", "returns"];

/** 상태 필터 버튼 고정 순서 — 전체/승인대기/승인완료/거절 */
const ALL_STATUS_KINDS: OrderStatus[] = ["all", "pending", "approved", "rejected"];

function statusLabel(s: OrderStatus): string {
  if (s === "all") return "전체";
  if (s === "pending") return "승인대기";
  if (s === "approved") return "승인완료";
  return "거절";
}

interface Props {
  /** 상단 카드에서 허용된 기업(목록 버튼은 항상 노출, 여기 없으면 비활성) */
  listScopeCompanies: OrderCompanyCode[];
  /** 상단 카드에서 허용된 거래유형(목록 버튼은 항상 노출, 여기 없으면 비활성) */
  listScopeDealKinds: OrderErpDealKind[];
  /** 목록 조회에 쓸 기업(비어 있으면 상단 범위 전체와 동일) */
  narrowCompanies: OrderErpSystem[];
  /** 목록 조회에 쓸 거래유형(비어 있으면 상단 범위 전체와 동일) */
  narrowDealKinds: OrderErpDealKind[];
  onToggleNarrowCompany: (...args: [OrderErpSystem]) => void;
  onToggleNarrowDealKind: (...args: [OrderErpDealKind]) => void;
  itemSearch: string;
  onItemSearchChange: (...args: [string]) => void;
  /** 현재 상태 필터(전체/승인대기/승인완료/거절) */
  status?: OrderStatus;
  onStatusChange?: (...args: [OrderStatus]) => void;
  variant?: "card" | "embedded";
  hideEmbeddedLabel?: boolean;
}

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
  status,
  onStatusChange,
  variant = "card",
  hideEmbeddedLabel = false,
}: Props) {
  const [searchDraft, setSearchDraft] = useState(itemSearch);

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
      {status !== undefined && onStatusChange ? (
        <div>
          <Label className="mb-1.5 block text-xs">상태</Label>
          <div className="flex flex-wrap gap-1">
            {ALL_STATUS_KINDS.map((s) => (
              <Button
                key={s}
                type="button"
                variant={status === s ? "secondary" : "outline"}
                size="sm"
                className="h-7 shrink-0 px-2.5 text-[0.8rem]"
                onClick={() => onStatusChange(s)}
              >
                {statusLabel(s)}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
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
      {/* 기간 필터 제거 — 변경 이유: ERP 원천 조회 기간 지정 UI를 상단 데이터 연동 카드로 이동 */}
    </>
  );

  if (variant === "embedded") {
    return (
      <div className="space-y-2">
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
