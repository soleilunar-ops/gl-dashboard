// 변경 이유: 수동 입력/CSV 업로드 모달을 분리해 메인 페이지 컴포넌트 길이를 줄이고 유지보수를 쉽게 했습니다.
"use client";

import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CoupangCenter } from "./constants/coupangCenters";
import { COUPANG_CENTERS } from "./constants/coupangCenters";
import { COUPANG_PRODUCTS } from "./constants/coupangProducts";
import type { OrderItem, PurchaseOrder } from "./types/milkrun";

type ManualDraft = {
  orderNumber: string;
  centerName: string;
  deliveryDate: string;
  reworkOffset: 1 | 2;
  memo: string;
  items: Array<OrderItem & { id: string }>;
};

const REQUIRED_FIELDS = [
  { key: "orderNumber", label: "발주번호" },
  { key: "productName", label: "품목명" },
  { key: "quantity", label: "수량" },
  { key: "deliveryDate", label: "입고예정일" },
  { key: "centerName", label: "센터명" },
] as const;

type MappingKey = (typeof REQUIRED_FIELDS)[number]["key"];

const FIELD_CANDIDATES: Record<MappingKey, string[]> = {
  orderNumber: ["발주번호", "주문번호", "po", "order", "주문 id", "발주 id"],
  productName: ["품목명", "상품명", "상품", "sku", "옵션명", "판매상품명"],
  quantity: ["수량", "발주수량", "주문수량", "qty", "수량(ea)", "수량(팩)", "확정수량", "최종수량"],
  deliveryDate: ["입고예정일", "납품예정일", "도착예정일", "배송예정일", "입고일", "date"],
  centerName: ["센터명", "도착지", "목적지", "물류센터", "센터", "fc", "hub"],
};

function normalizeText(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function parseQuantity(value: unknown): number {
  const raw = String(value ?? "")
    .replace(/,/g, "")
    .trim();
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDateToIso(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + value * 86400000);
    return date.toISOString().slice(0, 10);
  }

  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
  const replaced = raw.replace(/[./]/g, "-");
  const date = new Date(`${replaced}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function pickCenterName(rawCenter: string): string {
  const normalized = normalizeText(rawCenter);
  const exact = COUPANG_CENTERS.find((center) => normalizeText(center.name) === normalized);
  if (exact) return exact.name;

  const partial = COUPANG_CENTERS.find((center) => normalized.includes(normalizeText(center.name)));
  if (partial) return partial.name;

  const reversePartial = COUPANG_CENTERS.find((center) =>
    normalizeText(center.name).includes(normalized)
  );
  return reversePartial?.name ?? rawCenter;
}

function pickProductId(rawProductName: string): string | null {
  const normalized = normalizeText(rawProductName);
  if (!normalized) return null;

  const exact = COUPANG_PRODUCTS.find((product) => {
    const full = normalizeText(`${product.company}${product.name}${product.unit}`);
    const nameOnly = normalizeText(product.name);
    return full === normalized || nameOnly === normalized;
  });
  if (exact) return exact.id;

  const partial = COUPANG_PRODUCTS.find((product) => {
    const full = normalizeText(`${product.company}${product.name}${product.unit}`);
    const nameOnly = normalizeText(product.name);
    return full.includes(normalized) || normalized.includes(nameOnly);
  });
  return partial?.id ?? null;
}

function guessMapping(columns: string[]): Record<MappingKey, string> {
  const matched: Record<MappingKey, string> = {
    orderNumber: "",
    productName: "",
    quantity: "",
    deliveryDate: "",
    centerName: "",
  };

  (Object.keys(FIELD_CANDIDATES) as MappingKey[]).forEach((key) => {
    const candidates = FIELD_CANDIDATES[key];
    const found = columns.find((column) => {
      const normalizedColumn = normalizeText(column);
      return candidates.some((candidate) => normalizedColumn.includes(normalizeText(candidate)));
    });
    matched[key] = found ?? "";
  });

  return matched;
}

function findColumnByCandidates(columns: string[], candidates: string[]): string {
  const found = columns.find((column) => {
    const normalizedColumn = normalizeText(column);
    return candidates.some((candidate) => normalizedColumn.includes(normalizeText(candidate)));
  });
  return found ?? "";
}

function slugText(value: string): string {
  return normalizeText(value).replace(/[^a-z0-9가-힣]/g, "");
}

function parseExcelRows(fileBuffer: ArrayBuffer): Record<string, unknown>[] {
  const workbook = XLSX.read(fileBuffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const firstSheet = workbook.Sheets[firstSheetName];
  if (!firstSheet) return [];

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, {
    header: 1,
    blankrows: false,
    raw: true,
  });
  if (aoa.length === 0) return [];

  const candidateKeys = Object.values(FIELD_CANDIDATES)
    .flat()
    .map((key) => normalizeText(key));
  let headerRowIndex = 0;
  let bestScore = -1;

  for (let index = 0; index < Math.min(aoa.length, 20); index += 1) {
    const row = aoa[index];
    if (!Array.isArray(row)) continue;
    const score = row.reduce<number>((sum, cell) => {
      const normalized = normalizeText(String(cell ?? ""));
      if (!normalized) return sum;
      return candidateKeys.some((key) => normalized.includes(key)) ? sum + 1 : sum;
    }, 0);
    if (score > bestScore) {
      bestScore = score;
      headerRowIndex = index;
    }
  }

  const headerRow = aoa[headerRowIndex];
  if (!Array.isArray(headerRow)) return [];
  const headers = headerRow.map((cell, index) => {
    const label = String(cell ?? "").trim();
    return label || `컬럼_${index + 1}`;
  });

  const dataRows = aoa.slice(headerRowIndex + 1);
  return dataRows
    .filter((row) => Array.isArray(row))
    .map((row) => {
      const mapped: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        mapped[header] = Array.isArray(row) ? (row[index] ?? "") : "";
      });
      return mapped;
    })
    .filter((row) => Object.values(row).some((value) => String(value ?? "").trim() !== ""));
}

interface ManualOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  centers: CoupangCenter[];
  onSave: (order: PurchaseOrder) => void;
}

function createInitialDraft(): ManualDraft {
  return {
    orderNumber: "",
    centerName: "",
    deliveryDate: "",
    reworkOffset: 1,
    memo: "",
    items: [{ id: crypto.randomUUID(), productId: "", orderQty: 0 }],
  };
}

export function ManualOrderDialog({ open, onOpenChange, centers, onSave }: ManualOrderDialogProps) {
  const [draft, setDraft] = useState<ManualDraft>(createInitialDraft());

  const handleSave = () => {
    const validItems = draft.items.filter((item) => item.productId && item.orderQty > 0);
    if (!draft.orderNumber || !draft.centerName || !draft.deliveryDate || validItems.length === 0) {
      return;
    }

    onSave({
      id: crypto.randomUUID(),
      orderNumber: draft.orderNumber,
      centerName: draft.centerName,
      deliveryDate: draft.deliveryDate,
      reworkOffset: draft.reworkOffset,
      items: validItems.map(({ id, ...item }) => item),
      memo: draft.memo,
      createdAt: new Date().toISOString(),
    });

    setDraft(createInitialDraft());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>수동 발주 입력</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2 md:grid-cols-2">
            <div className="grid gap-1">
              <Label>발주번호</Label>
              <Input
                value={draft.orderNumber}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, orderNumber: event.target.value }))
                }
                placeholder="예: CP-2026-0415"
              />
            </div>
            <div className="grid gap-1">
              <Label>목적지 센터</Label>
              <Input
                list="coupang-centers"
                value={draft.centerName}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, centerName: event.target.value }))
                }
                placeholder="센터명 검색"
              />
              <datalist id="coupang-centers">
                {centers.map((center) => (
                  <option
                    key={center.name}
                    value={center.name}
                  >{`${center.name} (${center.region})`}</option>
                ))}
              </datalist>
            </div>
            <div className="grid gap-1">
              <Label>쿠팡 입고 예정일</Label>
              <Input
                type="date"
                value={draft.deliveryDate}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, deliveryDate: event.target.value }))
                }
              />
            </div>
            <div className="grid gap-1">
              <Label>재작업일 기준</Label>
              <div className="bg-muted/40 flex gap-1 rounded-md border p-1">
                <Button
                  type="button"
                  size="sm"
                  variant={draft.reworkOffset === 1 ? "default" : "ghost"}
                  onClick={() => setDraft((prev) => ({ ...prev, reworkOffset: 1 }))}
                >
                  입고 1일 전
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={draft.reworkOffset === 2 ? "default" : "ghost"}
                  onClick={() => setDraft((prev) => ({ ...prev, reworkOffset: 2 }))}
                >
                  입고 2일 전
                </Button>
              </div>
            </div>
            <div className="grid gap-1 md:col-span-2">
              <Label>메모</Label>
              <Input
                value={draft.memo}
                onChange={(event) => setDraft((prev) => ({ ...prev, memo: event.target.value }))}
                placeholder="선택 입력"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>발주 품목</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    items: [...prev.items, { id: crypto.randomUUID(), productId: "", orderQty: 0 }],
                  }))
                }
              >
                + 품목 추가
              </Button>
            </div>
            {draft.items.map((item, index) => {
              const product = COUPANG_PRODUCTS.find((target) => target.id === item.productId);
              return (
                <div
                  key={item.id}
                  className="grid gap-2 rounded-md border p-3 md:grid-cols-[2fr_1fr_auto]"
                >
                  <Select
                    value={item.productId}
                    onValueChange={(value) =>
                      setDraft((prev) => ({
                        ...prev,
                        items: prev.items.map((target, targetIndex) =>
                          targetIndex === index ? { ...target, productId: value } : target
                        ),
                      }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="품목 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {COUPANG_PRODUCTS.map((target) => (
                        <SelectItem key={target.id} value={target.id}>
                          {`${target.company} · ${target.name} ${target.unit}매`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={0}
                    value={item.orderQty || ""}
                    onChange={(event) => {
                      const parsed = Number(event.target.value);
                      setDraft((prev) => ({
                        ...prev,
                        items: prev.items.map((target, targetIndex) =>
                          targetIndex === index
                            ? { ...target, orderQty: Number.isFinite(parsed) ? parsed : 0 }
                            : target
                        ),
                      }));
                    }}
                    placeholder="발주 수량(팩)"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        items: prev.items.filter((target) => target.id !== item.id),
                      }))
                    }
                    disabled={draft.items.length <= 1}
                  >
                    삭제
                  </Button>
                  <p className="text-muted-foreground text-xs md:col-span-3">
                    {product?.palletQty
                      ? `팔렛당 ${product.palletQty.toLocaleString("ko-KR")}팩 · ${product.stacking}`
                      : "⚠ 데이터 미등록: 저장 후 밀크런 탭에서 팔렛 수를 직접 입력하세요."}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button type="button" onClick={handleSave}>
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportOrders: (orders: PurchaseOrder[]) => void;
}

export function CsvImportDialog({ open, onOpenChange, onImportOrders }: CsvImportDialogProps) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [importMessage, setImportMessage] = useState<string>("");
  const [mapping, setMapping] = useState<Record<MappingKey, string>>({
    orderNumber: "",
    productName: "",
    quantity: "",
    deliveryDate: "",
    centerName: "",
  });

  const columns = useMemo(() => (rows[0] ? Object.keys(rows[0]) : []), [rows]);

  useEffect(() => {
    if (columns.length === 0) return;
    const guessed = guessMapping(columns);
    setMapping((prev) => ({
      orderNumber: prev.orderNumber || guessed.orderNumber,
      productName: prev.productName || guessed.productName,
      quantity: prev.quantity || guessed.quantity,
      deliveryDate: prev.deliveryDate || guessed.deliveryDate,
      centerName: prev.centerName || guessed.centerName,
    }));
  }, [columns]);

  const parseFile = async (file: File) => {
    setImportMessage("");
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension === "csv") {
      const parsed = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
        Papa.parse<Record<string, unknown>>(file, {
          header: true,
          skipEmptyLines: true,
          complete: (result) => resolve(result.data),
          error: (error) => reject(error),
        });
      });
      setRows(parsed);
      return;
    }

    const buffer = await file.arrayBuffer();
    const parsed = parseExcelRows(buffer);
    setRows(parsed);
  };

  const handleImport = () => {
    const confirmedColumn = findColumnByCandidates(columns, ["확정수량", "최종수량", "확정 수량"]);
    const orderedColumn = findColumnByCandidates(columns, [
      "발주수량",
      "주문수량",
      "요청수량",
      "발주 수량",
    ]);
    const skuIdColumn = findColumnByCandidates(columns, [
      "sku id",
      "skuid",
      "sku코드",
      "상품id",
      "sku",
    ]);
    let skippedCount = 0;

    const grouped = new Map<string, PurchaseOrder>();
    rows.forEach((row) => {
      const orderNumber = String(row[mapping.orderNumber] ?? "").trim();
      const productName = String(row[mapping.productName] ?? "").trim();
      const mappedQuantity = parseQuantity(row[mapping.quantity]);
      const confirmedQuantity = confirmedColumn ? parseQuantity(row[confirmedColumn]) : 0;
      const orderedQuantity = orderedColumn ? parseQuantity(row[orderedColumn]) : 0;
      const quantity =
        confirmedQuantity > 0
          ? confirmedQuantity
          : mappedQuantity > 0
            ? mappedQuantity
            : orderedQuantity;
      const deliveryDate = parseDateToIso(row[mapping.deliveryDate]);
      const centerName = pickCenterName(String(row[mapping.centerName] ?? "").trim());
      if (!orderNumber || !productName || !deliveryDate || !centerName || quantity <= 0) {
        skippedCount += 1;
        return;
      }

      const productId = pickProductId(productName);
      const rawSkuId = skuIdColumn ? String(row[skuIdColumn] ?? "").trim() : "";
      const fallbackProductId = `custom:${rawSkuId || slugText(productName).slice(0, 40) || crypto.randomUUID()}`;
      const resolvedProductId = productId ?? fallbackProductId;

      const key = `${orderNumber}|${centerName}|${deliveryDate}`;
      const found = grouped.get(key);
      if (!found) {
        grouped.set(key, {
          id: crypto.randomUUID(),
          orderNumber,
          centerName,
          deliveryDate,
          reworkOffset: 1,
          memo: "CSV 업로드",
          createdAt: new Date().toISOString(),
          items: [
            {
              productId: resolvedProductId,
              orderQty: quantity,
              itemName: productName,
              externalSkuId: rawSkuId || undefined,
            },
          ],
        });
        return;
      }
      found.items.push({
        productId: resolvedProductId,
        orderQty: quantity,
        itemName: productName,
        externalSkuId: rawSkuId || undefined,
      });
    });

    const imported = Array.from(grouped.values());
    onImportOrders(imported);
    if (imported.length === 0) {
      setImportMessage(
        "가져올 수 있는 발주 데이터가 없습니다. 컬럼 매핑(발주번호/품목명/수량/입고예정일/센터명)을 확인하세요."
      );
      return;
    }
    setImportMessage(
      `가져오기 완료: ${imported.length.toLocaleString("ko-KR")}건, 제외 ${skippedCount.toLocaleString("ko-KR")}행`
    );
    setRows([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>CSV/XLSX 업로드</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">
            쿠팡 서플라이허브 &gt; 발주 목록 &gt; 엑셀 다운로드 후 업로드하세요.
          </p>
          <Input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(event) => event.target.files?.[0] && void parseFile(event.target.files[0])}
          />
          {importMessage ? <p className="text-sm text-amber-700">{importMessage}</p> : null}

          {rows.length > 0 && (
            <>
              <div className="grid gap-2 md:grid-cols-5">
                {REQUIRED_FIELDS.map((field) => (
                  <div key={field.key} className="space-y-1">
                    <Label>{field.label}</Label>
                    <Select
                      value={mapping[field.key]}
                      onValueChange={(value) =>
                        setMapping((prev) => ({ ...prev, [field.key]: value }))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="컬럼 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {columns.map((column) => (
                          <SelectItem key={column} value={column}>
                            {column}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    {columns.map((column) => (
                      <TableHead key={column}>{column}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 5).map((row, index) => (
                    <TableRow key={`${row[columns[0] ?? ""]}-${index}`}>
                      {columns.map((column) => (
                        <TableCell key={`${column}-${index}`}>
                          {String(row[column] ?? "")}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button type="button" disabled={rows.length === 0} onClick={handleImport}>
            가져오기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
