"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
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
import { useLeadTime, type LeadTimeRow } from "./_hooks/useLeadTime";

const STEP_LABELS = [
  "① 발주확정",
  "② 카고레디",
  "③ 상하이 출항",
  "④ 인천 입항",
  "⑤ 파주 창고 입고",
] as const;

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

// 전체 최대 지연 (비교 가능한 쌍이 없으면 hasAny: false)
const getMaxDelay = (row: LeadTimeRow): { max: number; hasAny: boolean } => {
  const delays: number[] = [];
  if (row.step4_actual && row.step4_expected)
    delays.push(calcDelay(row.step4_actual, row.step4_expected));
  if (row.step5_actual && row.step5_expected)
    delays.push(calcDelay(row.step5_actual, row.step5_expected));
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

function totalExpectedLeadDays(row: LeadTimeRow): number | null {
  if (!row.step1_actual || !row.step5_expected) return null;
  return Math.round(
    (new Date(row.step5_expected).getTime() - new Date(row.step1_actual).getTime()) / 86400000
  );
}

function currentStageLabel(cs: number): string {
  if (cs <= 1) return STEP_LABELS[0];
  if (cs === 2) return STEP_LABELS[1];
  if (cs === 3) return STEP_LABELS[2];
  if (cs === 4) return STEP_LABELS[3];
  return STEP_LABELS[4];
}

function currentStagePillClass(cs: number): string {
  if (cs <= 1) return "bg-muted text-muted-foreground";
  if (cs === 2 || cs === 3) return "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200";
  if (cs === 4) return "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200";
  return "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200";
}

function isStepCurrent(row: LeadTimeRow, step: number): boolean {
  if (row.current_step === 0) return step === 1;
  return row.current_step === step;
}

function getActualValue(row: LeadTimeRow, step: number): string | null {
  if (step === 1) return row.step1_actual;
  if (step === 2) return row.step2_actual;
  if (step === 3) return row.step3_actual;
  if (step === 4) return row.step4_actual;
  return row.step5_actual;
}

function getExpectedValue(row: LeadTimeRow, step: number): string | null {
  if (step === 3) {
    if (row.step4_expected) {
      return subtractCalendarDays(row.step4_expected, row.sea_days);
    }
    if (row.step4_actual) {
      return subtractCalendarDays(row.step4_actual, row.sea_days);
    }
    return null;
  }
  if (step === 4) return row.step4_expected;
  if (step === 5) return row.step5_expected;
  return null;
}

function stepCardClass(row: LeadTimeRow, step: number): string {
  const done = !!getActualValue(row, step);
  const cur = isStepCurrent(row, step);
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
    isMockMode,
    updateActual,
    updateParams,
    saveBL,
    approveOrder,
    addOrder,
    refetch,
  } = useLeadTime();

  const mockBanner = isMockMode ? (
    <div
      className="mb-4 rounded-lg border border-amber-500/40 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"
      role="status"
    >
      <strong>MOCK 모드</strong> — DB 없이 UI와 <code className="text-[0.8rem]">/api/tracking</code>
      만 검증합니다. 테이블 준비 후에는 <code className="text-[0.8rem]">.env.local</code>에서{" "}
      <code className="text-[0.8rem]">NEXT_PUBLIC_LEADTIME_MOCK</code>를 지우고 서버 재시작하세요.
    </div>
  ) : null;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftDates, setDraftDates] = useState<Record<number, string>>({});
  const [draftSea, setDraftSea] = useState<string>("2");
  const [draftCustoms, setDraftCustoms] = useState<string>("2");
  const [blInput, setBlInput] = useState("");
  const [blMessage, setBlMessage] = useState<"ok" | "fail" | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newPo, setNewPo] = useState("");
  const [newProduct, setNewProduct] = useState("");
  const [newErp, setNewErp] = useState("");
  const [newSea, setNewSea] = useState("2");
  const [newCustoms, setNewCustoms] = useState("2");

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

  /** 발주 행 변경 시 조회 메시지 초기화 */
  useEffect(() => {
    setBlMessage(null);
  }, [selectedId]);

  useEffect(() => {
    if (!selected) {
      setDraftDates({});
      setDraftSea("2");
      setDraftCustoms("2");
      setBlInput("");
      return;
    }
    setDraftDates({
      1: selected.step1_actual ?? "",
      2: selected.step2_actual ?? "",
      3: selected.step3_actual ?? "",
      4: selected.step4_actual ?? "",
      5: selected.step5_actual ?? "",
    });
    setDraftSea(String(selected.sea_days));
    setDraftCustoms(String(selected.customs_days));
    setBlInput(selected.bl_number ?? "");
  }, [selected]);

  const handleSaveDates = useCallback(async () => {
    if (!selected) return;
    for (let s = 1; s <= 5; s++) {
      const draft = draftDates[s] ?? "";
      const prev = getActualValue(selected, s) ?? "";
      const nextVal = draft === "" ? null : draft;
      const prevVal = prev === "" ? null : prev;
      if (nextVal !== prevVal) {
        await updateActual(selected.id, s, nextVal);
      }
    }
  }, [draftDates, selected, updateActual]);

  const handleParamsBlur = useCallback(async () => {
    if (!selected) return;
    const sea = Number.parseInt(draftSea, 10);
    const customs = Number.parseInt(draftCustoms, 10);
    if (Number.isNaN(sea) || sea < 1 || Number.isNaN(customs) || customs < 1) return;
    if (sea === selected.sea_days && customs === selected.customs_days) return;
    await updateParams(selected.id, sea, customs);
  }, [draftCustoms, draftSea, selected, updateParams]);

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
        {mockBanner}
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
              + 발주 추가
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
          message={error ? "위 오류를 해결한 뒤 다시 시도해 주세요." : "등록된 발주가 없습니다."}
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
          newSea={newSea}
          setNewSea={setNewSea}
          newCustoms={newCustoms}
          setNewCustoms={setNewCustoms}
          onSubmit={async () => {
            await addOrder({
              po_number: newPo.trim(),
              product_name: newProduct.trim(),
              erp_code: newErp.trim() || undefined,
              sea_days: Number.parseInt(newSea, 10) || 2,
              customs_days: Number.parseInt(newCustoms, 10) || 2,
            });
            setDialogOpen(false);
            setNewPo("");
            setNewProduct("");
            setNewErp("");
            setNewSea("2");
            setNewCustoms("2");
          }}
        />
      </div>
    );
  }

  return (
    <div className={sectionShell}>
      {mockBanner}
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
                발주부터 파주 입고까지 단계별 일정을 추적합니다.
              </p>
            </>
          ) : null}
          {error ? <p className="text-destructive mt-1 text-xs">에러: {error}</p> : null}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
            + 발주 추가
          </Button>
          <Button variant="outline" size="sm" onClick={() => alert("Wings API 연동 후 활성화")}>
            엑셀 추출
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
              <p className="text-muted-foreground text-xs">상하이 → 인천항 → 파주</p>
            </div>
            <div className="flex items-center gap-2">{detailStatusBadge}</div>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="flex flex-wrap items-end gap-6">
              <div className="flex items-center gap-2">
                <Label htmlFor="sea_days" className="text-muted-foreground text-xs">
                  해상운송일
                </Label>
                <Input
                  id="sea_days"
                  type="number"
                  min={1}
                  className="w-20"
                  value={draftSea}
                  onChange={(e) => setDraftSea(e.target.value)}
                  onBlur={() => void handleParamsBlur()}
                />
                <span className="text-muted-foreground text-sm">일</span>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="customs_days" className="text-muted-foreground text-xs">
                  내륙+통관
                </Label>
                <Input
                  id="customs_days"
                  type="number"
                  min={1}
                  className="w-20"
                  value={draftCustoms}
                  onChange={(e) => setDraftCustoms(e.target.value)}
                  onBlur={() => void handleParamsBlur()}
                />
                <span className="text-muted-foreground text-sm">일</span>
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch lg:overflow-x-auto">
              {STEP_LABELS.map((label, idx) => {
                const step = idx + 1;
                const row = selected;
                const expected = getExpectedValue(row, step);
                const actualDraft = draftDates[step] ?? "";
                const showDelay = expected && actualDraft && (step === 4 || step === 5);
                return (
                  <div key={label} className="flex min-w-0 flex-1 items-stretch gap-1">
                    <div
                      className={cn(
                        "flex flex-1 flex-col gap-2 rounded-lg border p-3",
                        stepCardClass(row, step)
                      )}
                    >
                      <p className="text-xs font-medium">{label}</p>
                      <div className="text-muted-foreground text-xs">
                        예상 <span className="text-foreground">{expected ?? "—"}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground text-xs">실제</span>
                        <Input
                          type="date"
                          className="text-xs"
                          value={actualDraft}
                          onChange={(e) =>
                            setDraftDates((d) => ({
                              ...d,
                              [step]: e.target.value,
                            }))
                          }
                        />
                        {showDelay && expected && actualDraft ? (
                          <DelayBadge actual={actualDraft} expected={expected} />
                        ) : null}
                      </div>
                      {step === 2 && (
                        <div className="border-border mt-2 space-y-2 border-t pt-2">
                          <Label className="text-xs">BL번호</Label>
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
                              조회는 완료됐지만 유니패스·해양청에서 선박/일정을 받지 못했습니다.{" "}
                              <code className="text-[0.7rem]">UNIPASS_API_KEY</code>·BL을 확인하고,
                              ETA는 <code className="text-[0.7rem]">PUBLIC_DATA_API_KEY</code>와
                              호출부호(
                              <code className="text-[0.7rem]">clsgn</code>)가 필요할 수 있습니다.
                            </p>
                          ) : null}
                          {blMessage === "fail" ? (
                            <p className="text-destructive text-xs">조회 실패, 수동 입력 필요</p>
                          ) : null}
                        </div>
                      )}
                      {step === 4 && selected.tracking_status ? (
                        <Badge variant="outline" className="mt-1 w-fit text-xs">
                          {selected.tracking_status}
                        </Badge>
                      ) : null}
                    </div>
                    {step < 5 ? (
                      <div className="text-muted-foreground flex shrink-0 items-center px-0.5">
                        <ChevronRight className="h-4 w-4" />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </CardContent>
          <CardFooter className="flex flex-wrap justify-end gap-2 border-t">
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
          </CardFooter>
        </Card>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>SKU</TableHead>
            <TableHead>발주일</TableHead>
            <TableHead>현재 단계</TableHead>
            <TableHead>총 예상 납기</TableHead>
            <TableHead>현재 지연</TableHead>
            <TableHead>납품기일</TableHead>
            <TableHead>상태</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row) => {
            const totalDays = totalExpectedLeadDays(row);
            const { max: maxD, hasAny: hasDelay } = getMaxDelay(row);
            const st = getStatus(row);
            const orderDate = row.step1_actual ? row.step1_actual : row.created_at.slice(0, 10);
            return (
              <TableRow
                key={row.id}
                className={cn("cursor-pointer", row.id === selectedId ? "bg-muted/50" : undefined)}
                onClick={() => setSelectedId(row.id)}
              >
                <TableCell>
                  <span className="font-medium">{row.product_name}</span>
                  <span className="text-muted-foreground ml-1 text-xs">{row.po_number}</span>
                </TableCell>
                <TableCell>{orderDate}</TableCell>
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
                <TableCell>{totalDays !== null ? `${totalDays}일` : "—"}</TableCell>
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
                  {row.step5_expected ?? <span className="text-muted-foreground">계산 중</span>}
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
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <NewOrderDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        newPo={newPo}
        setNewPo={setNewPo}
        newProduct={newProduct}
        setNewProduct={setNewProduct}
        newErp={newErp}
        setNewErp={setNewErp}
        newSea={newSea}
        setNewSea={setNewSea}
        newCustoms={newCustoms}
        setNewCustoms={setNewCustoms}
        onSubmit={async () => {
          await addOrder({
            po_number: newPo.trim(),
            product_name: newProduct.trim(),
            erp_code: newErp.trim() || undefined,
            sea_days: Number.parseInt(newSea, 10) || 2,
            customs_days: Number.parseInt(newCustoms, 10) || 2,
          });
          setDialogOpen(false);
          setNewPo("");
          setNewProduct("");
          setNewErp("");
          setNewSea("2");
          setNewCustoms("2");
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
  newSea,
  setNewSea,
  newCustoms,
  setNewCustoms,
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
  newSea: string;
  setNewSea: (v: string) => void;
  newCustoms: string;
  setNewCustoms: (v: string) => void;
  onSubmit: () => Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>신규 발주 추가</DialogTitle>
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
            <Label htmlFor="dlg_erp">ERP코드 (선택)</Label>
            <Input id="dlg_erp" value={newErp} onChange={(e) => setNewErp(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label htmlFor="dlg_sea">해상운송일</Label>
              <Input
                id="dlg_sea"
                type="number"
                min={1}
                value={newSea}
                onChange={(e) => setNewSea(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="dlg_cus">내륙+통관</Label>
              <Input
                id="dlg_cus"
                type="number"
                min={1}
                value={newCustoms}
                onChange={(e) => setNewCustoms(e.target.value)}
              />
            </div>
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
