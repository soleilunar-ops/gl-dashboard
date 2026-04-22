"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { CalendarDays, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ORDER_COMPANIES } from "@/lib/orders/orderMeta";
import { cn } from "@/lib/utils";
import { useContractFormOptions, type ContractCompanyCode } from "./_hooks/useContractFormOptions";

type CurrencyCode = "CNY" | "USD" | "KRW";

interface Props {
  onAdded: () => void;
}

/** 부가세 10% 포함 합계 → 공급가액·부가세 분리(원 단위 반올림) */
function splitVatFromInclusive(total: number): { supply: number; vat: number } {
  const supply = Math.round((total / 1.1) * 100) / 100;
  const vat = Math.round((total - supply) * 100) / 100;
  return { supply, vat };
}

function formatMoney(n: number): string {
  return n.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 환율 입력 문자열 → 양의 유한수 또는 null */
function parsePositiveRate(raw: string): number | null {
  const n = Number(String(raw).replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** 수동 구매 계약 추가 — orders INSERT (승인대기) */
export default function OrderContractAddForm({ onAdded }: Props) {
  const listId = useId();
  const [localCompanyCode, setLocalCompanyCode] = useState<ContractCompanyCode>("gl");
  /** 대시보드 상단 기업 필터와 무관하게 폼 내 선택값만 사용 */
  const effectiveCompanyCode: ContractCompanyCode = localCompanyCode;

  const {
    items,
    suppliers,
    loading: loadingOpts,
    error: optsError,
  } = useContractFormOptions(effectiveCompanyCode);

  const [txDate, setTxDate] = useState<Date>(() => new Date());
  const [calOpen, setCalOpen] = useState(false);
  const [selectedMappingId, setSelectedMappingId] = useState<number | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [quantityInput, setQuantityInput] = useState("");
  const [unitPriceInput, setUnitPriceInput] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("CNY");
  const [exchangeRateInput, setExchangeRateInput] = useState("");
  const [exchangeLoading, setExchangeLoading] = useState(false);
  const [exchangeFetchError, setExchangeFetchError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedOption = useMemo(
    () => items.find((o) => o.mappingId === selectedMappingId) ?? null,
    [items, selectedMappingId]
  );

  useEffect(() => {
    setSelectedMappingId(null);
    setSupplierName("");
  }, [effectiveCompanyCode]);

  const fetchExchangeRate = useCallback(async () => {
    if (currency === "KRW") {
      setExchangeRateInput("1");
      setExchangeFetchError(null);
      setExchangeLoading(false);
      return;
    }
    setExchangeLoading(true);
    setExchangeFetchError(null);
    try {
      const res = await fetch(`/api/exchange-rate?from=${currency}&to=KRW`);
      const data = (await res.json()) as { rate?: number; error?: string };
      if (!res.ok || typeof data.rate !== "number") {
        setExchangeFetchError(
          data.error ?? "실시간 환율을 불러오지 못했습니다. 직접 입력해 주세요."
        );
        return;
      }
      setExchangeRateInput(String(data.rate));
      setExchangeFetchError(null);
    } catch {
      setExchangeFetchError("실시간 환율을 불러오지 못했습니다. 직접 입력해 주세요.");
    } finally {
      setExchangeLoading(false);
    }
  }, [currency]);

  useEffect(() => {
    void fetchExchangeRate();
  }, [fetchExchangeRate]);

  const quantity = Number(quantityInput);
  const unitPrice = Number(unitPriceInput);
  const lineTotal =
    Number.isFinite(quantity) && Number.isFinite(unitPrice) && quantity > 0 && unitPrice >= 0
      ? Math.round(quantity * unitPrice * 100) / 100
      : null;

  const { supply: supplyAmount, vat: vatAmount } =
    lineTotal !== null ? splitVatFromInclusive(lineTotal) : { supply: null, vat: null };

  /** 라벨 보조: 원화 선택 시 (KRW), 외화 시 (통화/KRW) */
  const exchangePairHint = useMemo(() => {
    if (currency === "KRW") return "(KRW)";
    return `(${currency}/KRW)`;
  }, [currency]);

  const parsedExchangeRate = parsePositiveRate(exchangeRateInput);
  const exchangeOk =
    currency === "KRW"
      ? parsedExchangeRate !== null && parsedExchangeRate === 1
      : parsedExchangeRate !== null;

  const canSubmit =
    selectedMappingId !== null &&
    selectedOption !== null &&
    supplierName.trim() !== "" &&
    Number.isInteger(quantity) &&
    quantity > 0 &&
    Number.isFinite(unitPrice) &&
    unitPrice >= 0 &&
    lineTotal !== null &&
    exchangeOk;

  const handleSubmit = async () => {
    if (!canSubmit || !selectedOption || lineTotal === null) return;
    setSubmitting(true);
    setMessage(null);
    setError(null);
    const purchaseDate = format(txDate, "yyyy-MM-dd");
    try {
      const res = await fetch("/api/orders/manual-erp-purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyCode: effectiveCompanyCode,
          itemId: selectedOption.itemId,
          erpCode: selectedOption.erpCode,
          productName: selectedOption.name,
          purchaseDate,
          quantity,
          unitPrice,
          grossTotal: lineTotal,
          supplyAmount: supplyAmount ?? undefined,
          vatAmount: vatAmount ?? undefined,
          currency,
          exchangeRateToKrw: currency === "KRW" ? 1 : (parsedExchangeRate ?? undefined),
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
      setSelectedMappingId(null);
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="border-border rounded-lg border p-3">
      {optsError ? (
        <p className="text-destructive mb-2 text-xs">옵션 로드 오류: {optsError}</p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs">기업</Label>
          <Select
            value={localCompanyCode}
            onValueChange={(v) => setLocalCompanyCode(v as ContractCompanyCode)}
          >
            <SelectTrigger className="h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ORDER_COMPANIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 sm:col-span-2 lg:col-span-2">
          <Label className="text-xs">일자</Label>
          <Popover open={calOpen} onOpenChange={setCalOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-9 w-full justify-start font-normal md:max-w-[280px]"
              >
                <CalendarDays className="mr-2 h-4 w-4 shrink-0" />
                {format(txDate, "yyyy년 M월 d일", { locale: ko })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                locale={ko}
                selected={txDate}
                onSelect={(d) => {
                  if (d) setTxDate(d);
                  setCalOpen(false);
                }}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
          <Label className="text-xs">품목코드 및 품목명</Label>
          <Select
            value={selectedMappingId !== null ? String(selectedMappingId) : ""}
            onValueChange={(v) => setSelectedMappingId(v ? Number(v) : null)}
            disabled={loadingOpts || items.length === 0}
          >
            <SelectTrigger className="h-9 w-full">
              <SelectValue placeholder={loadingOpts ? "로딩 중…" : "품목 선택"} />
            </SelectTrigger>
            <SelectContent>
              {items.map((opt) => (
                <SelectItem key={opt.mappingId} value={String(opt.mappingId)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">수량</Label>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={quantityInput}
            onChange={(e) => setQuantityInput(e.target.value)}
            placeholder="0"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-1 lg:col-span-3">
          <Label className="text-xs">단가</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              className="h-9 min-w-[120px] flex-1"
              value={unitPriceInput}
              onChange={(e) => setUnitPriceInput(e.target.value)}
              placeholder="0.00"
            />
            <Select value={currency} onValueChange={(v) => setCurrency(v as CurrencyCode)}>
              <SelectTrigger className="h-9 w-[100px] shrink-0">
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
          <Label className="text-xs">공급가액</Label>
          <div className="bg-muted text-muted-foreground flex h-9 items-center justify-end rounded-md border px-3 text-sm tabular-nums">
            {supplyAmount !== null ? formatMoney(supplyAmount) : "—"}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">부가세</Label>
          <div className="bg-muted text-muted-foreground flex h-9 items-center justify-end rounded-md border px-3 text-sm tabular-nums">
            {vatAmount !== null ? formatMoney(vatAmount) : "—"}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">합계</Label>
          <div className="bg-muted text-muted-foreground flex h-9 items-center justify-end rounded-md border px-3 text-sm tabular-nums">
            {lineTotal !== null ? formatMoney(lineTotal) : "—"}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-1">
            <Label className="text-xs">
              환율 <span className="text-muted-foreground font-normal">{exchangePairHint}</span>
            </Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground h-auto min-h-7 max-w-[148px] shrink-0 px-1.5 py-1 text-left text-[10px] leading-tight sm:max-w-none sm:text-[11px]"
              disabled={exchangeLoading || currency === "KRW"}
              onClick={() => void fetchExchangeRate()}
              title="실시간 환율 다시 조회"
            >
              <span className="inline-flex items-center gap-1">
                <RefreshCw
                  className={cn("h-3.5 w-3.5 shrink-0", exchangeLoading && "animate-spin")}
                />
                실시간 환율 조회
              </span>
            </Button>
          </div>
          <Input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            className="h-9 cursor-text tabular-nums"
            value={exchangeRateInput}
            onChange={(e) => setExchangeRateInput(e.target.value)}
            placeholder={currency === "KRW" ? "1" : "실시간 조회 또는 직접 입력·조정"}
            disabled={currency === "KRW"}
            aria-describedby={
              [
                currency !== "KRW" ? "exchange-rate-editable-hint" : "",
                exchangeFetchError ? "exchange-rate-hint" : "",
              ]
                .filter(Boolean)
                .join(" ") || undefined
            }
          />
          {currency !== "KRW" ? (
            <p
              id="exchange-rate-editable-hint"
              className="text-muted-foreground text-[10px] leading-tight"
            >
              조회 후에도 칸을 눌러 숫자를 직접 바꿀 수 있습니다.
            </p>
          ) : null}
          {exchangeFetchError ? (
            <p id="exchange-rate-hint" className="text-muted-foreground text-[10px] leading-tight">
              {exchangeFetchError}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
          <Label className="text-xs">거래처명</Label>
          <Input
            list={listId}
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            placeholder="선택 또는 입력"
            className="h-9"
          />
          <datalist id={listId}>
            {suppliers.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs">
          {error ? <span className="text-destructive">{error}</span> : null}
          {message ? <span className="text-emerald-600">{message}</span> : null}
        </div>
        <Button
          type="button"
          size="sm"
          className="shrink-0"
          disabled={!canSubmit || submitting}
          onClick={() => void handleSubmit()}
        >
          {submitting ? "저장 중…" : "계약추가"}
        </Button>
      </div>
    </div>
  );
}
