"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { companyLabel, type OrderCompanyCode } from "@/lib/orders/orderMeta";
import { useContractFormOptions } from "./_hooks/useContractFormOptions";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function daysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}

function todayParts(): { y: number; m: number; d: number } {
  const t = new Date();
  return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() };
}

function toIsoDate(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

const YEAR_START = 2020;

interface Props {
  onAdded: () => void;
  selectedCompanyCode: OrderCompanyCode | null;
}

/** 수동 구매 계약 추가 — orders 테이블에 status='pending', tx_type='purchase'로 INSERT */
export default function OrderContractAddForm({ onAdded, selectedCompanyCode }: Props) {
  const {
    items,
    suppliers,
    loading: loadingOpts,
    error: optsError,
  } = useContractFormOptions(selectedCompanyCode);
  const today = useMemo(() => todayParts(), []);

  const [year, setYear] = useState(today.y);
  const [month, setMonth] = useState(today.m);
  const [day, setDay] = useState(today.d);

  const [itemId, setItemId] = useState<number | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [quantityInput, setQuantityInput] = useState("");
  const [unitPriceInput, setUnitPriceInput] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 날짜 보정 (월 바뀌면 일수 제한)
  useEffect(() => {
    const maxDay = daysInMonth(year, month);
    if (day > maxDay) setDay(maxDay);
  }, [year, month, day]);

  // 기업 바뀌면 품목/거래처 초기화
  useEffect(() => {
    setItemId(null);
    setSupplierName("");
  }, [selectedCompanyCode]);

  const yearOptions = useMemo(() => {
    const out: number[] = [];
    for (let y = today.y; y >= YEAR_START; y -= 1) out.push(y);
    return out;
  }, [today.y]);

  const dayOptions = useMemo(() => {
    const max = daysInMonth(year, month);
    return Array.from({ length: max }, (_, i) => i + 1);
  }, [year, month]);

  const selectedItem = useMemo(
    () => items.find((o) => o.itemId === itemId) ?? null,
    [items, itemId]
  );

  const quantity = Number(quantityInput);
  const unitPrice = Number(unitPriceInput);
  const grossTotal =
    Number.isFinite(quantity) && Number.isFinite(unitPrice) && quantity > 0 && unitPrice >= 0
      ? Math.round(quantity * unitPrice * 100) / 100
      : null;

  const canSubmit =
    selectedCompanyCode !== null &&
    itemId !== null &&
    supplierName.trim() !== "" &&
    Number.isInteger(quantity) &&
    quantity > 0 &&
    Number.isFinite(unitPrice) &&
    unitPrice >= 0 &&
    grossTotal !== null;

  const handleSubmit = async () => {
    if (!canSubmit || selectedCompanyCode === null || itemId === null || grossTotal === null)
      return;
    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/orders/manual-erp-purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyCode: selectedCompanyCode,
          itemId,
          erpCode: selectedItem?.erpCode ?? null,
          productName: selectedItem?.name ?? null,
          purchaseDate: toIsoDate(year, month, day),
          quantity,
          unitPrice,
          grossTotal,
          supplierName: supplierName.trim(),
        }),
      });
      const payload = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        setError(payload.error ?? payload.message ?? `HTTP ${res.status}`);
        return;
      }
      setMessage("저장되었습니다. (승인대기 상태)");
      setQuantityInput("");
      setUnitPriceInput("");
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  };

  if (selectedCompanyCode === null) {
    return (
      <div className="border-border rounded-lg border p-3">
        <p className="text-muted-foreground text-sm">
          기업을 먼저 선택하면 수동 계약 입력이 활성화됩니다.
        </p>
      </div>
    );
  }

  return (
    <div className="border-border rounded-lg border p-3">
      <p className="mb-3 text-sm font-medium">
        수동 계약 추가 · {companyLabel(selectedCompanyCode)}
      </p>
      {optsError ? (
        <p className="text-destructive mb-2 text-xs">옵션 로드 오류: {optsError}</p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {/* 날짜 */}
        <div className="space-y-1.5">
          <Label className="text-xs">거래일</Label>
          <div className="flex gap-1">
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="h-9 w-[88px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}년
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="h-9 w-[72px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {m}월
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(day)} onValueChange={(v) => setDay(Number(v))}>
              <SelectTrigger className="h-9 w-[72px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {dayOptions.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d}일
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* 품목 — shadcn Select (네이티브 option 금지 규칙 준수) */}
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-2">
          <Label className="text-xs">품목</Label>
          <Select
            value={itemId !== null ? String(itemId) : ""}
            onValueChange={(v) => setItemId(v ? Number(v) : null)}
            disabled={loadingOpts || items.length === 0}
          >
            <SelectTrigger className="h-9 w-full">
              <SelectValue placeholder={loadingOpts ? "로딩 중…" : "품목 선택"} />
            </SelectTrigger>
            <SelectContent>
              {items.map((opt) => (
                <SelectItem key={opt.itemId} value={String(opt.itemId)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 거래처 */}
        <div className="space-y-1.5">
          <Label className="text-xs">거래처</Label>
          {suppliers.length > 0 ? (
            <Select
              value={supplierName}
              onValueChange={(v) => setSupplierName(v === "__custom__" ? "" : v)}
            >
              <SelectTrigger className="h-9 w-full">
                <SelectValue placeholder="거래처 선택" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
                <SelectItem value="__custom__">직접 입력</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              placeholder="거래처명"
            />
          )}
          {suppliers.length > 0 && supplierName === "" ? (
            <Input
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              placeholder="거래처명 직접 입력"
            />
          ) : null}
        </div>

        {/* 수량 */}
        <div className="space-y-1.5">
          <Label className="text-xs">수량</Label>
          <Input
            type="number"
            inputMode="numeric"
            value={quantityInput}
            onChange={(e) => setQuantityInput(e.target.value)}
            placeholder="0"
          />
        </div>

        {/* 단가 */}
        <div className="space-y-1.5">
          <Label className="text-xs">단가(CNY)</Label>
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            value={unitPriceInput}
            onChange={(e) => setUnitPriceInput(e.target.value)}
            placeholder="0.00"
          />
        </div>

        {/* 합계 */}
        <div className="space-y-1.5">
          <Label className="text-xs">합계(CNY)</Label>
          <div className="bg-muted flex h-9 items-center justify-end rounded-md border px-3 text-sm tabular-nums">
            {grossTotal !== null
              ? grossTotal.toLocaleString("ko-KR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : "—"}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="text-xs">
          {error ? <span className="text-destructive">{error}</span> : null}
          {message ? <span className="text-emerald-600">{message}</span> : null}
        </div>
        <Button size="sm" disabled={!canSubmit || submitting} onClick={handleSubmit}>
          {submitting ? "저장 중…" : "계약 추가 (승인대기)"}
        </Button>
      </div>
    </div>
  );
}
