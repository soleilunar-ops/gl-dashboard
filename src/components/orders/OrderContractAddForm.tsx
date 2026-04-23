"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  const [itemPopoverOpen, setItemPopoverOpen] = useState(false);
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
  /** 품목 입력칸 표시값 — 검색 타이핑과 datalist 선택을 모두 처리 */
  const [itemInputValue, setItemInputValue] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [quantityInput, setQuantityInput] = useState("");
  const [unitPriceInput, setUnitPriceInput] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>("CNY");
  const [exchangeRateInput, setExchangeRateInput] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedOption = useMemo(
    () => items.find((o) => o.mappingId === selectedMappingId) ?? null,
    [items, selectedMappingId]
  );

  /** 입력값 기준으로 필터링된 품목 옵션 — 코드 또는 품목명 부분일치, 대소문자 무시 */
  const filteredItemOptions = useMemo(() => {
    const q = itemInputValue.trim().toLowerCase();
    if (!q) return items;
    return items.filter((opt) => opt.label.toLowerCase().includes(q));
  }, [items, itemInputValue]);

  useEffect(() => {
    setSelectedMappingId(null);
    setItemInputValue("");
    setSupplierName("");
  }, [effectiveCompanyCode]);

  const syncExchangeInputByCurrency = useCallback(() => {
    if (currency === "KRW") {
      setExchangeRateInput("1");
    } else if (exchangeRateInput.trim() === "") {
      setExchangeRateInput("");
    }
  }, [currency, exchangeRateInput]);

  useEffect(() => {
    syncExchangeInputByCurrency();
  }, [syncExchangeInputByCurrency]);

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
      setItemInputValue("");
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
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
                className="h-9 w-full justify-start font-normal"
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
          {/* 커스텀 콤보박스 — 전체 UI와 일관된 shadcn 디자인 토큰 사용 */}
          <Popover open={itemPopoverOpen} onOpenChange={setItemPopoverOpen}>
            <PopoverAnchor asChild>
              <Input
                value={itemInputValue}
                onChange={(e) => {
                  const v = e.target.value;
                  setItemInputValue(v);
                  const match = items.find((opt) => opt.label === v);
                  setSelectedMappingId(match ? match.mappingId : null);
                  setItemPopoverOpen(true);
                }}
                onFocus={() => setItemPopoverOpen(true)}
                placeholder={loadingOpts ? "로딩 중…" : "품목코드 또는 품목명으로 검색"}
                disabled={loadingOpts || items.length === 0}
                autoComplete="off"
                className="h-9"
              />
            </PopoverAnchor>
            <PopoverContent
              align="start"
              sideOffset={4}
              className="max-h-[300px] w-[var(--radix-popover-trigger-width)] gap-0 overflow-y-auto p-1"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              {filteredItemOptions.length === 0 ? (
                <div className="text-muted-foreground px-2 py-2 text-sm">
                  일치하는 품목이 없습니다
                </div>
              ) : (
                filteredItemOptions.map((opt) => {
                  const isSelected = opt.mappingId === selectedMappingId;
                  return (
                    <button
                      key={opt.mappingId}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()} // 입력 포커스 유지
                      onClick={() => {
                        setItemInputValue(opt.label);
                        setSelectedMappingId(opt.mappingId);
                        setItemPopoverOpen(false);
                      }}
                      className={cn(
                        "hover:bg-accent hover:text-accent-foreground flex w-full cursor-pointer items-center rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                        isSelected && "bg-accent text-accent-foreground font-medium"
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })
              )}
            </PopoverContent>
          </Popover>
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
          <Label className="text-xs">
            환율 <span className="text-muted-foreground font-normal">{exchangePairHint}</span>
          </Label>
          <Input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            className="h-9 cursor-text tabular-nums"
            value={exchangeRateInput}
            onChange={(e) => setExchangeRateInput(e.target.value)}
            placeholder={currency === "KRW" ? "1" : "직접 입력"}
            disabled={currency === "KRW"}
          />
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
