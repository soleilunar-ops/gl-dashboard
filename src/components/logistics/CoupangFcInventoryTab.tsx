"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  COUPANG_CENTER_ALL,
  COUPANG_INVENTORY_SORT_OPTIONS,
  coerceCoupangInventorySortBy,
  useCoupangInventoryByCenter,
  type CoupangInventoryByCenterRow,
} from "./_hooks/useCoupangInventoryByCenter";
import { toast } from "sonner";
import { CoupangSkuAnalysisDialog } from "./CoupangSkuAnalysisDialog";

type UploadJsonOk = {
  ok: true;
  upserted: number;
  insertedRows: number;
  skippedExistingDateRows: number;
  skuMasterTouched: number;
  inputRows: number;
  uniqueRows: number;
  skippedEmptySku: number;
  op_dates: string[];
  skippedExistingDates: string[];
  parseWarnings: string[];
  fileName: string | null;
};

type UploadJsonErr = {
  error: string;
  parseWarnings?: string[];
  skippedEmptySku?: number;
};

const COL_COUNT = 12;
const PAGE_SIZE = 10;

/** 5개 페이지 윈도우 (끝단에서도 5개 유지) */
function buildPageNumbers(page: number, totalPages: number): number[] {
  const windowSize = 5;
  const half = Math.floor(windowSize / 2);
  let start = Math.max(1, page - half);
  let end = Math.min(totalPages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  const out: number[] = [];
  for (let i = start; i <= end; i += 1) out.push(i);
  return out;
}

/** 품목명·SKU·GL코드·발주문구 등 부분 일치 검색(공백으로 토큰 AND) */
function rowMatchesSearchQuery(r: CoupangInventoryByCenterRow, raw: string): boolean {
  const q = raw.trim().toLowerCase();
  if (!q) return true;
  const tokens = q.split(/\s+/).filter(Boolean);
  const haystack = [
    r.sku_id,
    r.center,
    r.gl_erp_code ?? "",
    r.item_name_raw ?? "",
    r.sku_name ?? "",
    r.order_status ?? "",
    r.order_status_detail ?? "",
    r.seq_no !== null && r.seq_no !== undefined ? String(r.seq_no) : "",
  ]
    .join(" ")
    .toLowerCase();
  return tokens.every((t) => haystack.includes(t));
}

export default function CoupangFcInventoryTab() {
  const {
    rows,
    sortBy,
    setSortBy,
    centers,
    centerFilter,
    setCenterFilter,
    latestOpDate,
    loading,
    error,
    refetch,
    summaryText,
  } = useCoupangInventoryByCenter();
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [lastResult, setLastResult] = useState<UploadJsonOk | null>(null);
  const [analysisRow, setAnalysisRow] = useState<CoupangInventoryByCenterRow | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);

  const filteredRows = useMemo(
    () => rows.filter((r) => rowMatchesSearchQuery(r, searchQuery)),
    [rows, searchQuery]
  );

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedRows = useMemo(
    () => filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredRows, safePage]
  );
  const pageNumbers = buildPageNumbers(safePage, totalPages);

  // 검색/필터/정렬 변경 시 1페이지로
  useEffect(() => {
    setPage(1);
  }, [searchQuery, centerFilter, sortBy]);

  const handleUpload = useCallback(async () => {
    if (!file) {
      toast.error("CSV 파일을 선택하세요.");
      return;
    }
    setUploading(true);
    setLastResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/logistics/coupang-inventory-upload", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json()) as UploadJsonOk | UploadJsonErr;
      if (!res.ok || !("ok" in json) || !json.ok) {
        const err = json as UploadJsonErr;
        toast.error(err.error || "업로드 실패");
        if (err.parseWarnings?.length) {
          toast.message("파싱 경고", {
            description: err.parseWarnings.slice(0, 8).join("\n"),
          });
        }
        return;
      }
      setLastResult(json);
      toast.success(
        `쿠팡 센터 재고 반영 완료 (신규 ${json.insertedRows}건, 중복 날짜 건너뜀 ${json.skippedExistingDateRows}건)`
      );
      if (json.parseWarnings.length > 0) {
        toast.message("일부 행 경고", {
          description: json.parseWarnings.slice(0, 6).join("\n"),
        });
      }
      await refetch();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "네트워크 오류";
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  }, [file, refetch]);

  return (
    <div className="space-y-6">
      <Card className="gap-2 py-3">
        <CardHeader className="pb-0">
          <CardTitle>쿠팡 일별 재고 CSV 업로드</CardTitle>
        </CardHeader>
        <CardContent>
          {/* 파일 이름 숨김 input + 중앙 정렬 커스텀 버튼 */}
          <input
            ref={fileInputRef}
            id="coupang-csv"
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
            }}
          />
          <div className="flex flex-col items-center gap-2">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-11 px-6 text-base"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                파일 선택
              </Button>
              <Button
                type="button"
                className="h-11 px-6 text-base"
                disabled={uploading || !file}
                onClick={() => void handleUpload()}
              >
                {uploading ? "업로드 중…" : "업로드 및 반영"}
              </Button>
            </div>
            {file ? (
              <p className="text-muted-foreground max-w-full truncate text-xs">{file.name}</p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {lastResult ? (
        <p className="text-muted-foreground text-sm">
          마지막 업로드: {lastResult.fileName ?? "(이름 없음)"} · 입력 {lastResult.inputRows}행 ·
          고유 키 {lastResult.uniqueRows}건 · 신규 저장 {lastResult.insertedRows}건 · 중복 날짜
          건너뜀 {lastResult.skippedExistingDateRows}건 · SKU 마스터 {lastResult.skuMasterTouched}건
          · 기준일 {lastResult.op_dates.join(", ")}
        </p>
      ) : null}

      {/* 필터 + 요약줄을 하나의 흰색 카드로 감싼다 */}
      <Card className="gap-2 py-3">
        <CardContent className="space-y-2 px-4">
          {/* 목록 검색(왼쪽, flex-1) · 센터 필터 / 정렬 기준(오른쪽, 좁게) */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:gap-4">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Label htmlFor="coupang-inventory-search" className="shrink-0">
                목록 검색
              </Label>
              <div className="relative">
                <Search
                  className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2"
                  aria-hidden
                />
                <Input
                  id="coupang-inventory-search"
                  type="search"
                  placeholder="SKU명, 품목명, SKU ID, GL코드…"
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  disabled={loading}
                  autoComplete="off"
                />
              </div>
              {!loading && searchQuery.trim() && rows.length > 0 ? (
                <p className="text-muted-foreground text-xs">
                  검색 일치 {filteredRows.length}건 · 전체 {rows.length}건
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2 sm:w-[180px]">
              <Label htmlFor="center-filter" className="shrink-0">
                센터 필터
              </Label>
              <Select
                value={centerFilter}
                onValueChange={setCenterFilter}
                disabled={loading || centers.length === 0}
              >
                <SelectTrigger id="center-filter" className="w-full">
                  <SelectValue placeholder="센터 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={COUPANG_CENTER_ALL}>전체 센터</SelectItem>
                  {centers.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c === "-" ? "센터 미지정 (-)" : c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2 sm:w-[180px]">
              <Label htmlFor="sort-by" className="shrink-0">
                정렬 기준
              </Label>
              <Select
                value={sortBy}
                onValueChange={(v) => setSortBy(coerceCoupangInventorySortBy(v))}
                disabled={loading}
              >
                <SelectTrigger id="sort-by" className="w-full">
                  <SelectValue placeholder="정렬 선택" />
                </SelectTrigger>
                <SelectContent>
                  {COUPANG_INVENTORY_SORT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {summaryText ? <p className="text-center text-sm whitespace-pre">{summaryText}</p> : null}
        </CardContent>
      </Card>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <CoupangSkuAnalysisDialog
        row={analysisRow}
        open={analysisOpen}
        onOpenChange={(v) => {
          setAnalysisOpen(v);
          if (!v) setAnalysisRow(null);
        }}
      />

      <div className="bg-card overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>GL 순번</TableHead>
              <TableHead>품목명</TableHead>
              <TableHead>GL 품목코드</TableHead>
              <TableHead>센터</TableHead>
              <TableHead>SKU ID</TableHead>
              <TableHead>SKU명</TableHead>
              <TableHead>기준일</TableHead>
              <TableHead>현재재고</TableHead>
              <TableHead>입고</TableHead>
              <TableHead>출고</TableHead>
              <TableHead>발주상태</TableHead>
              <TableHead>품절</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: COL_COUNT }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COL_COUNT} className="text-muted-foreground h-24 text-center">
                  {latestOpDate
                    ? centerFilter !== COUPANG_CENTER_ALL
                      ? "선택한 센터에 해당하는 행이 없습니다. 필터를 바꿔 보세요."
                      : "저장된 재고 행이 없습니다."
                    : "CSV를 업로드하면 센터별 재고가 표시됩니다."}
                </TableCell>
              </TableRow>
            ) : filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COL_COUNT} className="text-muted-foreground h-24 text-center">
                  검색어에 맞는 행이 없습니다. 검색어를 바꿔 보세요.
                </TableCell>
              </TableRow>
            ) : (
              pagedRows.map((r) => (
                <TableRow
                  key={r.invId}
                  className="hover:bg-muted/50 cursor-pointer"
                  onClick={() => {
                    setAnalysisRow(r);
                    setAnalysisOpen(true);
                  }}
                >
                  <TableCell className="tabular-nums">{r.seq_no ?? "—"}</TableCell>
                  <TableCell className="max-w-[200px] truncate font-medium">
                    {r.item_name_raw ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">
                    {r.gl_erp_code ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.center}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">
                    {r.sku_id}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate text-sm">
                    {r.sku_name ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs tabular-nums">
                    {r.op_date}
                  </TableCell>
                  <TableCell className="tabular-nums">{r.current_stock.toLocaleString()}</TableCell>
                  <TableCell className="tabular-nums">{r.inbound_qty.toLocaleString()}</TableCell>
                  <TableCell className="tabular-nums">{r.outbound_qty.toLocaleString()}</TableCell>
                  <TableCell className="max-w-[120px] truncate text-xs">
                    {r.order_status ?? "—"}
                    {r.order_status_detail ? ` / ${r.order_status_detail}` : ""}
                  </TableCell>
                  <TableCell>{r.is_stockout ? "예" : "아니오"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {!loading && filteredRows.length > 0 ? (
          <div className="flex items-center justify-between gap-3 border-t px-3 py-2">
            <p className="text-muted-foreground text-xs whitespace-nowrap">
              총 {filteredRows.length.toLocaleString()}건 · {safePage} / {totalPages} 페이지
            </p>
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    text=""
                    onClick={(e) => {
                      e.preventDefault();
                      if (safePage > 1) setPage(safePage - 1);
                    }}
                    aria-disabled={safePage === 1}
                  />
                </PaginationItem>
                {pageNumbers.map((n) => (
                  <PaginationItem key={n}>
                    <PaginationLink
                      href="#"
                      isActive={n === safePage}
                      onClick={(e) => {
                        e.preventDefault();
                        setPage(n);
                      }}
                    >
                      {n}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    text=""
                    onClick={(e) => {
                      e.preventDefault();
                      if (safePage < totalPages) setPage(safePage + 1);
                    }}
                    aria-disabled={safePage >= totalPages}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        ) : null}
      </div>
    </div>
  );
}
