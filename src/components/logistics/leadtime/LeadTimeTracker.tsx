"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";

import EmptyState from "@/components/shared/EmptyState";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DB_STEPS,
  currentStageLabel,
  currentStagePillClass,
  getActualValue,
  getMaxDelay,
  getStatus,
  getStoredExpected,
} from "@/lib/logistics/leadTimeCalc";
import { downloadLeadTimeListExcel } from "@/lib/logistics/leadTimeExcel";
import { cn } from "@/lib/utils";

import { useLeadTime, type LeadtimeDbStep } from "../_hooks/useLeadTime";

import { LeadTimeStageCard } from "./LeadTimeStageCard";
import { NewLeadTimeDialog } from "./NewLeadTimeDialog";

type LeadTimeTrackerProps = {
  /** section: 창고 페이지 하단 블록 / page: 전용 라우트 */
  variant?: "section" | "page";
};

export default function LeadTimeTracker({ variant = "section" }: LeadTimeTrackerProps) {
  const sectionShell = variant === "page" ? "pb-2" : "border-border mt-8 border-t px-6 pt-8 pb-6";
  const showBlockTitle = variant !== "page";

  const {
    data,
    loading,
    error,
    blLookupLoading,
    updateActual,
    updateExpected,
    saveBL,
    approveOrder,
    deleteOrder,
    addOrder,
    refetch,
  } = useLeadTime();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftDates, setDraftDates] = useState<Partial<Record<LeadtimeDbStep, string>>>({});
  const [draftExpected, setDraftExpected] = useState<Partial<Record<LeadtimeDbStep, string>>>({});
  const [blInput, setBlInput] = useState("");
  const [blMessage, setBlMessage] = useState<"ok" | "fail" | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newPo, setNewPo] = useState("");
  const [newProduct, setNewProduct] = useState("");
  const [newErp, setNewErp] = useState("");
  const [newOrderDate, setNewOrderDate] = useState("");

  const selected = useMemo(() => data.find((r) => r.id === selectedId) ?? null, [data, selectedId]);

  useEffect(() => {
    if (data.length === 0) {
      setSelectedId(null);
      return;
    }
    const exists = data.some((r) => r.id === selectedId);
    if (!selectedId || !exists) {
      setSelectedId(data[0].id);
    }
  }, [data, selectedId]);

  /** 선택 행 변경 시 BL 조회 메시지 초기화 */
  useEffect(() => {
    setBlMessage(null);
  }, [selectedId]);

  useEffect(() => {
    if (!selected) {
      setDraftDates({});
      setDraftExpected({});
      setBlInput("");
      return;
    }
    setDraftDates({
      1: selected.step1_actual ?? "",
      3: selected.step3_actual ?? "",
      4: selected.step4_actual ?? "",
      5: selected.step5_actual ?? "",
    });
    setDraftExpected({
      3: selected.step3_expected ?? "",
      4: selected.step4_expected ?? "",
      5: selected.step5_expected ?? "",
    });
    setBlInput(selected.bl_number ?? "");
  }, [selected]);

  const handleSaveDates = useCallback(async () => {
    if (!selected) return;
    for (const { db } of DB_STEPS) {
      if (db === 1) continue;
      const expDraft = draftExpected[db] ?? "";
      const prevExp = getStoredExpected(selected, db) ?? "";
      const nextExp = expDraft.trim() === "" ? null : expDraft.trim();
      const prevExpNorm = prevExp === "" ? null : prevExp;
      if (nextExp !== prevExpNorm) {
        await updateExpected(selected.id, db, nextExp);
      }
    }
    for (const { db } of DB_STEPS) {
      const draft = draftDates[db] ?? "";
      const prev = getActualValue(selected, db) ?? "";
      const nextVal = draft === "" ? null : draft;
      const prevVal = prev === "" ? null : prev;
      if (nextVal !== prevVal) {
        await updateActual(selected.id, db, nextVal);
      }
    }
  }, [draftDates, draftExpected, selected, updateActual, updateExpected]);

  const handleBlLookup = useCallback(async () => {
    if (!selected || !blInput.trim()) return;
    setBlMessage(null);
    const ok = await saveBL(selected.id, blInput.trim());
    setBlMessage(ok ? "ok" : "fail");
  }, [blInput, saveBL, selected]);

  const detailStatusBadge = selected ? (
    <Badge variant="outline">{currentStageLabel(selected.current_step)}</Badge>
  ) : null;

  const handleNewOrderSubmit = useCallback(async () => {
    await addOrder({
      po_number: newPo.trim(),
      product_name: newProduct.trim(),
      erp_code: newErp.trim() || undefined,
      order_date: newOrderDate.trim() || undefined,
    });
    setDialogOpen(false);
    setNewPo("");
    setNewProduct("");
    setNewErp("");
    setNewOrderDate("");
  }, [addOrder, newPo, newProduct, newErp, newOrderDate]);

  if (loading) return <LoadingSpinner />;

  if (data.length === 0) {
    const schemaMissing =
      typeof error === "string" && /schema cache|could not find the table/i.test(error);
    return (
      <div className={sectionShell}>
        <div
          className={cn(
            "mb-4 flex flex-wrap items-center gap-2",
            showBlockTitle ? "justify-between" : "justify-end"
          )}
        >
          {showBlockTitle ? (
            <h2 className="text-lg font-medium">수입 리드타임</h2>
          ) : (
            <span className="sr-only">수입 리드타임 도구</span>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => void refetch()}>
              다시 불러오기
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
              + 건 추가
            </Button>
          </div>
        </div>
        {error ? (
          <div
            className="border-destructive/50 bg-destructive/5 text-destructive mb-4 rounded-lg border p-4 text-sm"
            role="alert"
          >
            <p className="font-medium">리드타임 데이터를 불러오지 못했습니다.</p>
            <p className="mt-1 break-words">{error}</p>
            {schemaMissing ? (
              <p className="text-muted-foreground mt-2 text-xs">
                Supabase에 <code className="text-foreground">public.import_leadtime</code> 테이블이
                없거나 아직 반영되지 않은 경우입니다. SQL Editor로 테이블을 만든 뒤 새로고침하거나
                PM에게 마이그레이션을 요청하세요.
              </p>
            ) : null}
          </div>
        ) : null}
        <EmptyState
          message={error ? "위 오류를 해결한 뒤 다시 시도해 주세요." : "등록된 건이 없습니다."}
        />
        <NewLeadTimeDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          newPo={newPo}
          setNewPo={setNewPo}
          newProduct={newProduct}
          setNewProduct={setNewProduct}
          newErp={newErp}
          setNewErp={setNewErp}
          newOrderDate={newOrderDate}
          setNewOrderDate={setNewOrderDate}
          onSubmit={handleNewOrderSubmit}
        />
      </div>
    );
  }

  return (
    <div className={sectionShell}>
      <div
        className={cn(
          "mb-6 flex flex-wrap items-start gap-4",
          showBlockTitle || error ? "justify-between" : "justify-end"
        )}
      >
        <div className="min-w-0 flex-1">
          {showBlockTitle ? (
            <>
              <h2 className="text-lg font-medium">수입 리드타임</h2>
              <p className="text-muted-foreground text-sm">
                ERP 발주 미연동 건은 수기로 등록하고, BL로 상하이 출항~파주 입고까지 추적합니다.
              </p>
            </>
          ) : null}
          {error ? <p className="text-destructive mt-1 text-xs">에러: {error}</p> : null}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
            + 건 추가
          </Button>
        </div>
      </div>

      {selected && (
        <Card className="mb-8">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 border-b pb-4">
            <div>
              <p className="text-[15px] font-medium">
                {selected.product_name} — {selected.po_number}
              </p>
              <p className="text-muted-foreground text-xs">
                BL 기준: 상하이 출항 → 인천 입항 → 파주 창고 (유니패스·공공데이터포털 외항반출입)
              </p>
            </div>
            <div className="flex items-center gap-2">{detailStatusBadge}</div>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch lg:overflow-x-auto">
              {DB_STEPS.map(({ db, label }, idx) => (
                <LeadTimeStageCard
                  key={label}
                  row={selected}
                  db={db}
                  label={label}
                  isLast={idx === DB_STEPS.length - 1}
                  draftDate={draftDates[db] ?? ""}
                  draftExpected={draftExpected[db] ?? ""}
                  onDraftDateChange={(v) => setDraftDates((d) => ({ ...d, [db]: v }))}
                  onDraftExpectedChange={(v) => setDraftExpected((d) => ({ ...d, [db]: v }))}
                  blInput={blInput}
                  onBlInputChange={setBlInput}
                  blLookupLoading={blLookupLoading}
                  blMessage={blMessage}
                  onBlLookup={() => void handleBlLookup()}
                />
              ))}
            </div>
          </CardContent>
          <CardFooter className="flex flex-wrap items-center justify-between gap-2 border-t">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => {
                if (!selected) return;
                if (
                  !window.confirm(
                    `「${selected.po_number}」건을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`
                  )
                ) {
                  return;
                }
                void deleteOrder(selected.id);
              }}
            >
              삭제
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => void handleSaveDates()}>
                저장
              </Button>
              <Button
                type="button"
                onClick={() => selected && void approveOrder(selected.id)}
                disabled={selected?.is_approved}
              >
                확인 완료 → 승인
              </Button>
            </div>
          </CardFooter>
        </Card>
      )}

      <div className="mb-3 flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={data.length === 0}
          onClick={() => downloadLeadTimeListExcel(data)}
        >
          엑셀 추출
        </Button>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">발주번호</TableHead>
              <TableHead className="min-w-[140px]">품목/품목코드</TableHead>
              <TableHead className="whitespace-nowrap">발주일</TableHead>
              <TableHead className="min-w-[100px]">BL 번호</TableHead>
              <TableHead className="whitespace-nowrap">현재 단계</TableHead>
              <TableHead className="whitespace-nowrap">예정 입고일</TableHead>
              <TableHead className="whitespace-nowrap">실제 입고일</TableHead>
              <TableHead className="whitespace-nowrap">현재 지연</TableHead>
              <TableHead className="whitespace-nowrap">상태</TableHead>
              <TableHead className="w-14 text-center">삭제</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => {
              const { max: maxD, hasAny: hasDelay } = getMaxDelay(row);
              const st = getStatus(row);
              const orderDate = row.step1_actual ?? "—";
              const erp = row.erp_code?.trim();
              return (
                <TableRow
                  key={row.id}
                  className={cn(
                    "cursor-pointer",
                    row.id === selectedId ? "bg-muted/50" : undefined
                  )}
                  onClick={() => setSelectedId(row.id)}
                >
                  <TableCell className="font-medium [font-variant-numeric:tabular-nums]">
                    {row.po_number}
                  </TableCell>
                  <TableCell>
                    <div className="max-w-[200px]">
                      <span className="font-medium">{row.product_name}</span>
                      {erp ? (
                        <span className="text-muted-foreground mt-0.5 block text-xs">{erp}</span>
                      ) : (
                        <span className="text-muted-foreground mt-0.5 block text-xs">—</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="[font-variant-numeric:tabular-nums]">{orderDate}</TableCell>
                  <TableCell>
                    {row.bl_number ? (
                      <span className="font-mono text-xs tracking-tight">{row.bl_number}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-xs",
                        currentStagePillClass(row.current_step)
                      )}
                    >
                      {currentStageLabel(row.current_step)}
                    </span>
                  </TableCell>
                  <TableCell className="[font-variant-numeric:tabular-nums]">
                    {row.step5_expected ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="[font-variant-numeric:tabular-nums]">
                    {row.step5_actual ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    {!hasDelay ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span
                        className={cn(
                          maxD > 0 && "text-destructive font-medium",
                          maxD === 0 && "text-green-600"
                        )}
                      >
                        {maxD > 0 ? `+${maxD}일` : "정시"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {st === "완료" && (
                      <Badge variant="default" className="text-xs">
                        완료
                      </Badge>
                    )}
                    {st === "주의" && (
                      <Badge variant="outline" className="border-amber-500 text-xs text-amber-800">
                        주의
                      </Badge>
                    )}
                    {st === "정상" && (
                      <Badge className="bg-green-600 text-xs text-white hover:bg-green-600">
                        정상
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="p-1 text-center" onClick={(e) => e.stopPropagation()}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:bg-destructive/10 size-8"
                      aria-label={`${row.po_number} 삭제`}
                      onClick={() => {
                        if (!window.confirm(`「${row.po_number}」건을 삭제할까요?`)) return;
                        void deleteOrder(row.id);
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <NewLeadTimeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        newPo={newPo}
        setNewPo={setNewPo}
        newProduct={newProduct}
        setNewProduct={setNewProduct}
        newErp={newErp}
        setNewErp={setNewErp}
        newOrderDate={newOrderDate}
        setNewOrderDate={setNewOrderDate}
        onSubmit={handleNewOrderSubmit}
      />
    </div>
  );
}
