"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

function clampDay(year: number, month: number, day: number, maxDay: number): number {
  return Math.min(day, maxDay);
}

const YEAR_START = 2020;
type CurrencyCode = "CNY" | "USD" | "KRW";

type Props = {
  onAdded: () => void;
  selectedCompanyCode: OrderCompanyCode | null;
};

/** 수입 계약 수동 추가 — 일자(년·월·일), 품목 Select, 수량·단가, 합계 기준 부가세 분해 표시, 거래처 Select */
export default function OrderContractAddForm({ onAdded, selectedCompanyCode }: Props) {
  const { products, suppliers, loading: loadingOpts, error: optsError } = useContractFormOptions();
  const today = useMemo(() => todayParts(), []);

  const [year, setYear] = useState(today.y);
  const [month, setMonth] = useState(today.m);
  const [day, setDay] = useState(today.d);

  const [productId, setProductId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [quantityInput, setQuantityInput] = useState("");
  const [unitPriceInput, setUnitPriceInput] = useState("");
  const [currencyCode, setCurrencyCode] = useState<CurrencyCode>("CNY");

  const [submitting, setSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);

  const maxYear = today.y;
  const monthMax = year === today.y ? today.m : 12;

  const dim = daysInMonth(year, month);
  const dayMax = year === today.y && month === today.m ? Math.min(today.d, dim) : dim;

  useEffect(() => {
    if (month > monthMax) {
      setMonth(monthMax);
    }
  }, [month, monthMax]);

  useEffect(() => {
    const nextDay = clampDay(year, month, day, dayMax);
    if (nextDay !== day) {
      setDay(nextDay);
    }
  }, [year, month, day, dayMax]);

  const quantity = useMemo(() => {
    const n = Number(quantityInput);
    if (!Number.isFinite(n) || n <= 0) {
      return null;
    }
    return Math.floor(n);
  }, [quantityInput]);

  const unitPrice = useMemo(() => {
    const n = Number(unitPriceInput);
    if (!Number.isFinite(n) || n < 0) {
      return null;
    }
    return n;
  }, [unitPriceInput]);

  const grossTotal =
    quantity !== null && unitPrice !== null ? Math.round(quantity * unitPrice * 100) / 100 : null;

  const supplyAmount = grossTotal !== null ? Math.round((grossTotal / 1.1) * 100) / 100 : null;
  const vatAmount =
    grossTotal !== null && supplyAmount !== null
      ? Math.round((grossTotal - supplyAmount) * 100) / 100
      : null;

  const purchaseDateIso = toIsoDate(year, month, day);

  const yearOptions = useMemo(() => {
    const list: number[] = [];
    for (let y = YEAR_START; y <= maxYear; y += 1) {
      list.push(y);
    }
    return list;
  }, [maxYear]);

  const handleSubmit = async () => {
    setFormMessage(null);
    if (!productId) {
      setFormMessage("품목을 선택하세요.");
      return;
    }
    if (selectedCompanyCode === null) {
      setFormMessage("상단에서 기업을 먼저 선택하세요.");
      return;
    }
    if (!supplierName) {
      setFormMessage("거래처를 선택하세요.");
      return;
    }
    if (quantity === null) {
      setFormMessage("수량은 1 이상의 정수로 입력하세요.");
      return;
    }
    if (unitPrice === null) {
      setFormMessage("단가(CNY)를 입력하세요.");
      return;
    }
    if (grossTotal === null) {
      setFormMessage("합계를 계산할 수 없습니다.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/orders/manual-erp-purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyCode: selectedCompanyCode,
          currencyCode,
          productId,
          purchaseDate: purchaseDateIso,
          quantity,
          unitPrice,
          grossTotal,
          supplierName,
        }),
      });
      const payload = (await response.json()) as { message?: string; detail?: string };
      if (!response.ok) {
        const reason = payload.detail ?? payload.message ?? `HTTP ${response.status}`;
        setFormMessage(`저장 실패: ${reason}`);
        return;
      }
      setFormMessage(payload.message ?? "저장되었습니다.");
      setQuantityInput("");
      setUnitPriceInput("");
      onAdded();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "네트워크 오류";
      setFormMessage(`저장 실패: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const fmt = (n: number | null) =>
    n === null
      ? "—"
      : n.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="border-border mb-4 rounded-lg border p-3">
      <p className="mb-3 text-sm font-medium">신규 주문건 입력</p>
      {optsError ? (
        <p className="text-destructive mb-2 text-xs">옵션 로드 오류: {optsError}</p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium">일자</label>
          <div className="flex flex-wrap gap-1">
            <Select
              value={String(year)}
              onValueChange={(v) => setYear(Number(v))}
              disabled={loadingOpts}
            >
              <SelectTrigger className="h-8 w-[88px]">
                <SelectValue placeholder="년" />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}년
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={String(month)}
              onValueChange={(v) => setMonth(Number(v))}
              disabled={loadingOpts}
            >
              <SelectTrigger className="h-8 w-[72px]">
                <SelectValue placeholder="월" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: monthMax }, (_, i) => i + 1).map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {m}월
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={String(day)}
              onValueChange={(v) => setDay(Number(v))}
              disabled={loadingOpts}
            >
              <SelectTrigger className="h-8 w-[72px]">
                <SelectValue placeholder="일" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: dayMax }, (_, i) => i + 1).map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d}일
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-muted-foreground text-[10px]">오늘 이후 날짜는 선택할 수 없습니다.</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium">기업(상단 선택)</label>
          <Input
            className="bg-muted h-8"
            readOnly
            disabled
            value={selectedCompanyCode ? companyLabel(selectedCompanyCode) : "미선택"}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium">품목코드 · 품목명(규격)</label>
          <Select
            value={productId || undefined}
            onValueChange={setProductId}
            disabled={loadingOpts || products.length === 0}
          >
            <SelectTrigger className="h-8">
              <SelectValue placeholder={products.length === 0 ? "등록된 품목 없음" : "품목 선택"} />
            </SelectTrigger>
            <SelectContent>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium">거래처명</label>
          <input
            className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-8 w-full rounded-md border px-3 py-1 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            list="order-suppliers"
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            placeholder={suppliers.length === 0 ? "거래처 직접 입력" : "선택 또는 직접 입력"}
            disabled={loadingOpts}
          />
          <datalist id="order-suppliers">
            {suppliers.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium">수량</label>
          <Input
            className="h-8"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={quantityInput}
            onChange={(e) => setQuantityInput(e.target.value)}
            disabled={loadingOpts}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium">단가</label>
          <div className="flex gap-1">
            <Input
              className="h-8"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={unitPriceInput}
              onChange={(e) => setUnitPriceInput(e.target.value)}
              disabled={loadingOpts}
            />
            <Select value={currencyCode} onValueChange={(v) => setCurrencyCode(v as CurrencyCode)}>
              <SelectTrigger className="h-8 w-[96px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CNY">CNY</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="KRW">KRW</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium">공급가액 ({currencyCode}, 자동)</label>
          <Input className="bg-muted h-8" readOnly disabled value={fmt(supplyAmount)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium">부가세 ({currencyCode}, 자동)</label>
          <Input className="bg-muted h-8" readOnly disabled value={fmt(vatAmount)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium">합계 ({currencyCode}, 자동)</label>
          <Input className="bg-muted h-8" readOnly disabled value={fmt(grossTotal)} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => {
            void handleSubmit();
          }}
          disabled={submitting || loadingOpts || selectedCompanyCode === null}
        >
          {submitting ? "저장 중…" : "계약건 저장"}
        </Button>
        {formMessage ? <span className="text-muted-foreground text-xs">{formMessage}</span> : null}
      </div>
    </div>
  );
}
