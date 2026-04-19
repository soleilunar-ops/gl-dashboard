"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { ChevronRight, Loader2, Trash2 } from "lucide-react";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import EmptyState from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useLeadTime, type LeadTimeRow, type LeadtimeDbStep } from "./_hooks/useLeadTime";

/** DB 컬럼 step2(카고레디)는 사용하지 않고, 상하이~파주는 BL·공공데이터·유니패스로 추적 */
const DB_STEPS: readonly { db: LeadtimeDbStep; label: string }[] = [
  { db: 1, label: "① 발주일" },
  { db: 3, label: "② 상하이 출항" },
  { db: 4, label: "③ 인천 입항" },
  { db: 5, label: "④ 파주 창고 입고" },
];

// 두 날짜 차이 (일)
const calcDelay = (actual: string, expected: string): number =>
  Math.round((new Date(actual).getTime() - new Date(expected).getTime()) / 86400000);

// YYYY-MM-DD 기준으로 일수 빼기
const subtractCalendarDays = (isoDate: string, days: number): string => {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - days);
  return dt.toISOString().slice(0, 10);
};

/** 입항(예정)·실제 기준으로 상하이 출항 예상일 자동 산출 */
function getComputedShanghaiExpected(row: LeadTimeRow): string | null {
  if (row.step4_expected) {
    return subtractCalendarDays(row.step4_expected, row.sea_days);
  }
  if (row.step4_actual) {
    return subtractCalendarDays(row.step4_actual, row.sea_days);
  }
  return null;
}

// 전체 최대 지연 (비교 가능한 쌍이 없으면 hasAny: false)
const getMaxDelay = (row: LeadTimeRow): { max: number; hasAny: boolean } => {
  const delays: number[] = [];
  const shanghaiExp = row.step3_expected ?? getComputedShanghaiExpected(row);
  if (row.step3_actual && shanghaiExp) {
    delays.push(calcDelay(row.step3_actual, shanghaiExp));
  }
  if (row.step4_actual && row.step4_expected) {
    delays.push(calcDelay(row.step4_actual, row.step4_expected));
  }
  if (row.step5_actual && row.step5_expected) {
    delays.push(calcDelay(row.step5_actual, row.step5_expected));
  }
  if (!delays.length) return { max: 0, hasAny: false };
  return { max: Math.max(...delays), hasAny: true };
};

// 상태
const getStatus = (row: LeadTimeRow): "완료" | "주의" | "정상" => {
  if (row.is_approved) return "완료";
  const { max, hasAny } = getMaxDelay(row);
  if (hasAny && max >= 3) return "주의";
  return "정상";
};

function currentStageLabel(cs: number): string {
  if (cs <= 1) return DB_STEPS[0].label;
  if (cs === 2) return DB_STEPS[1].label;
  if (cs === 3) return DB_STEPS[1].label;
  if (cs === 4) return DB_STEPS[2].label;
  return DB_STEPS[3].label;
}

function currentStagePillClass(cs: number): string {
  if (cs <= 1) return "bg-muted text-muted-foreground";
  if (cs === 2 || cs === 3) return "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200";
  if (cs === 4) return "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200";
  return "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200";
}

function isStepCurrent(row: LeadTimeRow, dbStep: LeadtimeDbStep): boolean {
  if (dbStep === 1) {
    return row.current_step === 0 || row.current_step === 1 || row.current_step === 2;
  }
  return row.current_step === dbStep;
}

function getActualValue(row: LeadTimeRow, dbStep: LeadtimeDbStep): string | null {
  if (dbStep === 1) return row.step1_actual;
  if (dbStep === 3) return row.step3_actual;
  if (dbStep === 4) return row.step4_actual;
  return row.step5_actual;
}

function getExpectedValue(row: LeadTimeRow, dbStep: LeadtimeDbStep): string | null {
  if (dbStep === 1) return null;
  if (dbStep === 3) {
    return row.step3_expected ?? getComputedShanghaiExpected(row);
  }
  if (dbStep === 4) return row.step4_expected;
  if (dbStep === 5) return row.step5_expected;
  return null;
}

/** DB에 저장된 수기 예상일(②단계 자동참고 제외) */
function getStoredExpected(row: LeadTimeRow, dbStep: LeadtimeDbStep): string | null {
  if (dbStep === 1) return null;
  if (dbStep === 3) return row.step3_expected;
  if (dbStep === 4) return row.step4_expected;
  return row.step5_expected;
}

function stepCardClass(row: LeadTimeRow, dbStep: LeadtimeDbStep): string {
  const done = !!getActualValue(row, dbStep);
  const cur = isStepCurrent(row, dbStep);
  if (done) return "border-green-200 bg-green-50";
  if (cur) return "border-blue-200 bg-blue-50";
  return "bg-muted/30 border-transparent";
}

function DelayBadge({ actual, expected }: { actual: string; expected: string }) {
  const d = calcDelay(actual, expected);
  if (d > 0)
    return (
      <Badge variant="destructive" className="text-xs">
        +{d}일 지연
      </Badge>
    );
  if (d === 0)
    return <Badge className="bg-green-600 text-xs text-white hover:bg-green-600">정시</Badge>;
  return (
    <Badge className="bg-green-600 text-xs text-white hover:bg-green-600">
      {Math.abs(d)}일 빠름
    </Badge>
  );
}

/** 화면 하단 리스트와 동일 컬럼으로 xlsx 다운로드 (Wings API 없음) */
function downloadLeadTimeListExcel(rows: LeadTimeRow[]) {
  if (rows.length === 0) return;
  const sheetRows = rows.map((row) => {
    const { max: maxD, hasAny: hasDelay } = getMaxDelay(row);
    const st = getStatus(row);
    const delayLabel = !hasDelay ? "—" : maxD > 0 ? `+${maxD}일` : "정시";
    return {
      발주번호: row.po_number,
      품목명: row.product_name,
      품목코드: row.erp_code ?? "",
      발주일: row.step1_actual ?? "",
      BL번호: row.bl_number ?? "",
      현재단계: currentStageLabel(row.current_step),
      예정입고일: row.step5_expected ?? "",
      실제입고일: row.step5_actual ?? "",
      현재지연: delayLabel,
      상태: st,
    };
  });
  const ws = XLSX.utils.json_to_sheet(sheetRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "수입리드타임");
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  XLSX.writeFile(wb, `수입리드타임_${stamp}.xlsx`);
}

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
        <NewOrderDialog
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
          onSubmit={async () => {
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
          }}
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
              {DB_STEPS.map(({ db, label }, idx) => {
                const row = selected;
                const expectedForBadge =
                  db === 1 ? null : (draftExpected[db] ?? "").trim() || getExpectedValue(row, db);
                const shanghaiHint =
                  db === 3 && !(draftExpected[3] ?? "").trim()
                    ? getComputedShanghaiExpected(row)
                    : null;
                const actualDraft = draftDates[db] ?? "";
                const showDelay = db !== 1 && !!expectedForBadge && !!actualDraft;
                return (
                  <div key={label} className="flex min-w-0 flex-1 items-stretch gap-1">
                    <div
                      className={cn(
                        "flex flex-1 flex-col gap-2 rounded-lg border p-3",
                        stepCardClass(row, db)
                      )}
                    >
                      <p className="text-xs font-medium">{label}</p>
                      {db !== 1 ? (
                        <div className="flex flex-col gap-1">
                          <span className="text-muted-foreground text-xs">예상</span>
                          <Input
                            type="date"
                            className="text-xs"
                            value={draftExpected[db] ?? ""}
                            onChange={(e) =>
                              setDraftExpected((d) => ({
                                ...d,
                                [db]: e.target.value,
                              }))
                            }
                          />
                          {db === 3 && shanghaiHint ? (
                            <p className="text-muted-foreground text-[0.65rem] leading-snug">
                              미입력 시 참고: {shanghaiHint} (입항 예정−해상일)
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground text-xs">실제</span>
                        <Input
                          type="date"
                          className="text-xs"
                          value={actualDraft}
                          onChange={(e) =>
                            setDraftDates((d) => ({
                              ...d,
                              [db]: e.target.value,
                            }))
                          }
                        />
                        {showDelay ? (
                          <DelayBadge actual={actualDraft} expected={expectedForBadge} />
                        ) : null}
                      </div>
                      {db === 1 ? (
                        <div className="border-border mt-2 space-y-2 border-t pt-2">
                          <Label className="text-xs">BL번호 (M/HBL)</Label>
                          <p className="text-muted-foreground text-[0.65rem] leading-snug">
                            유니패스 화물통관 + 공공데이터포털 외항반출입으로 일부 자동 반영됩니다.
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            <Input
                              placeholder="예: COSU1234567890"
                              value={blInput}
                              onChange={(e) => setBlInput(e.target.value)}
                              className="min-w-[140px] flex-1 text-xs"
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={blLookupLoading}
                              onClick={() => void handleBlLookup()}
                            >
                              {blLookupLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                "조회"
                              )}
                            </Button>
                          </div>
                          {selected.vessel_name ? (
                            <p className="text-xs text-green-600">선박명: {selected.vessel_name}</p>
                          ) : null}
                          {blMessage === "ok" &&
                          !selected.vessel_name &&
                          !selected.step4_expected &&
                          !selected.step4_actual &&
                          !selected.tracking_status ? (
                            <p className="text-xs text-amber-800 dark:text-amber-200">
                              조회는 완료됐지만 유니패스·외항반출입 API에서 선박/일정을 받지
                              못했습니다. <code className="text-[0.7rem]">UNIPASS_API_KEY</code>
                              ·BL을 확인하고, 입항 예정은{" "}
                              <code className="text-[0.7rem]">PUBLIC_DATA_API_KEY</code>와 호출부호(
                              <code className="text-[0.7rem]">clsgn</code>, 인천 등은{" "}
                              <code className="text-[0.7rem]">PUBLIC_DATA_PRT_AG_CD</code>)를 확인해
                              주세요.
                            </p>
                          ) : null}
                          {blMessage === "fail" ? (
                            <p className="text-destructive text-xs">조회 실패, 수동 입력 필요</p>
                          ) : null}
                        </div>
                      ) : null}
                      {db === 4 && selected.tracking_status ? (
                        <Badge variant="outline" className="mt-1 w-fit text-xs">
                          {selected.tracking_status}
                        </Badge>
                      ) : null}
                    </div>
                    {idx < DB_STEPS.length - 1 ? (
                      <div className="text-muted-foreground flex shrink-0 items-center px-0.5">
                        <ChevronRight className="h-4 w-4" />
                      </div>
                    ) : null}
                  </div>
                );
              })}
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

      <NewOrderDialog
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
        onSubmit={async () => {
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
        }}
      />
    </div>
  );
}

function NewOrderDialog({
  open,
  onOpenChange,
  newPo,
  setNewPo,
  newProduct,
  setNewProduct,
  newErp,
  setNewErp,
  newOrderDate,
  setNewOrderDate,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  newPo: string;
  setNewPo: (v: string) => void;
  newProduct: string;
  setNewProduct: (v: string) => void;
  newErp: string;
  setNewErp: (v: string) => void;
  newOrderDate: string;
  setNewOrderDate: (v: string) => void;
  onSubmit: () => Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>신규 건 추가 (수기)</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-1">
            <Label htmlFor="dlg_po">발주번호</Label>
            <Input id="dlg_po" value={newPo} onChange={(e) => setNewPo(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="dlg_prd">품목명</Label>
            <Input
              id="dlg_prd"
              value={newProduct}
              onChange={(e) => setNewProduct(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="dlg_order_date">발주일 (선택)</Label>
            <Input
              id="dlg_order_date"
              type="date"
              value={newOrderDate}
              onChange={(e) => setNewOrderDate(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="dlg_erp">품목코드 (ERP, 선택)</Label>
            <Input id="dlg_erp" value={newErp} onChange={(e) => setNewErp(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={() => void onSubmit()} disabled={!newPo.trim() || !newProduct.trim()}>
            확인
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
