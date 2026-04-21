// 변경 이유: 프롬프트의 비용 계산기(센터 선택·센터별 파렛트·총합·CSV·초안 저장) UI입니다.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import centersJson from "@/data/milkrun-centers.json";
import {
  loadAllocationDraft,
  saveAllocationDraft,
  type MilkrunDraftRow,
} from "@/lib/milkrun-allocation-draft";
import { computeAllocations } from "@/lib/milkrun-compute";
import { getFavoriteCenterNames, toggleFavorite } from "@/lib/milkrun-favorites";
import { useMilkrunAllocations } from "@/components/logistics/_hooks/useMilkrunAllocations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

const CENTERS: Array<{ name: string; basic: number }> = centersJson;

function formatInt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("ko-KR");
}

function csvEscape(value: string): string {
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export default function MilkrunCalculatorTab() {
  const { saveAllocation } = useMilkrunAllocations();
  const [search, setSearch] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [rows, setRows] = useState<MilkrunDraftRow[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [orderDate, setOrderDate] = useState("");
  const [memo, setMemo] = useState("");

  useEffect(() => {
    setFavorites(getFavoriteCenterNames());
    const draft = loadAllocationDraft();
    if (draft?.rows?.length) setRows(draft.rows);
  }, []);

  useEffect(() => {
    saveAllocationDraft({ rows });
  }, [rows]);

  const selectedNames = useMemo(() => new Set(rows.map((r) => r.name)), [rows]);

  const filteredCenters = useMemo(() => {
    const q = search.trim().toLowerCase();
    return CENTERS.filter((c) => {
      if (favoritesOnly && !favorites.includes(c.name)) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q);
    });
  }, [search, favoritesOnly, favorites]);

  const computed = useMemo(() => computeAllocations(rows), [rows]);

  const setPallets = useCallback((name: string, pallets: number) => {
    const safe = Math.max(0, Math.floor(Number.isFinite(pallets) ? pallets : 0));
    setRows((prev) => prev.map((r) => (r.name === name ? { ...r, pallets: safe } : r)));
  }, []);

  const removeRow = useCallback((name: string) => {
    setRows((prev) => prev.filter((r) => r.name !== name));
  }, []);

  const toggleCenter = useCallback((center: { name: string; basic: number }, checked: boolean) => {
    if (checked) {
      setRows((prev) => {
        if (prev.some((r) => r.name === center.name)) return prev;
        return [...prev, { name: center.name, basic: center.basic, pallets: 1 }];
      });
    } else {
      setRows((prev) => prev.filter((r) => r.name !== center.name));
    }
  }, []);

  const selectAllFiltered = () => {
    setRows((prev) => {
      const map = new Map(prev.map((r) => [r.name, r] as const));
      for (const c of filteredCenters) {
        if (!map.has(c.name)) map.set(c.name, { name: c.name, basic: c.basic, pallets: 1 });
      }
      return [...map.values()].sort((a, b) => a.basic - b.basic);
    });
  };

  const clearFiltered = () => {
    const names = new Set(filteredCenters.map((c) => c.name));
    setRows((prev) => prev.filter((r) => !names.has(r.name)));
  };

  const toggleStar = (name: string) => {
    setFavorites(toggleFavorite(name, favorites));
  };

  const downloadCsv = () => {
    const lines = ["센터명,BASIC,파렛트,금액"];
    for (const r of computed.rows) {
      lines.push([csvEscape(r.name), String(r.basic), String(r.pallets), String(r.cost)].join(","));
    }
    // Excel(Windows)이 UTF-8로 인식하도록 BOM 추가 — 없으면 한글 깨짐
    const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "milkrun-allocation.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const submitSave = async () => {
    if (!orderDate) {
      toast.error("출고일을 선택하세요.");
      return;
    }
    const items = computed.rows.map((r) => ({
      centerName: r.name,
      basicPrice: r.basic,
      palletCount: r.pallets,
    }));
    try {
      const result = await saveAllocation(orderDate, memo.trim() || null, items);
      if (!result.ok) {
        if (result.missingTable) {
          toast.error(
            "Supabase에 allocations 테이블이 없습니다. supabase/migrations를 적용하거나 대시보드에서 SQL을 실행하세요."
          );
        } else {
          toast.error(result.message);
        }
        return;
      }
      toast.success("저장되었습니다. 기간별 조회 탭에서 확인할 수 있어요.");
      setSaveOpen(false);
      setMemo("");
    } catch {
      toast.error("네트워크 오류로 저장에 실패했습니다.");
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm">
        BASIC 단가는 부가세 별도(VAT 별도)입니다. 티켓팅날 열린 센터만 선택한 뒤 센터별 파렛트 수를
        입력하세요.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="센터명 검색…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFavoritesOnly((v) => !v)}
            >
              {favoritesOnly ? "전체 보기" : "즐겨찾기만"}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={selectAllFiltered}>
              필터 전체 선택
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={clearFiltered}>
              필터 전체 해제
            </Button>
            <Badge variant="secondary">{`선택 ${selectedNames.size}곳`}</Badge>
          </div>
          <div className="max-h-[320px] overflow-y-auto rounded-md border p-2">
            <div className="grid gap-2 sm:grid-cols-2">
              {filteredCenters.map((c) => (
                <div
                  key={c.name}
                  className="hover:bg-muted/50 flex items-center gap-2 rounded px-1 py-1 text-sm"
                >
                  <Checkbox
                    checked={selectedNames.has(c.name)}
                    onCheckedChange={(v) => toggleCenter(c, v === true)}
                  />
                  <button
                    type="button"
                    className="flex-1 truncate text-left"
                    onClick={() => toggleCenter(c, !selectedNames.has(c.name))}
                  >
                    {c.name}
                  </button>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-amber-500"
                    onClick={(e) => {
                      e.preventDefault();
                      toggleStar(c.name);
                    }}
                    aria-label="즐겨찾기"
                  >
                    <Star
                      className={`h-4 w-4 ${favorites.includes(c.name) ? "fill-amber-400 text-amber-500" : ""}`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => setSaveOpen(true)} disabled={rows.length === 0}>
              이 배정 저장
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={downloadCsv}
              disabled={rows.length === 0}
            >
              CSV 다운로드
            </Button>
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>센터명</TableHead>
                  <TableHead className="text-right">BASIC</TableHead>
                  <TableHead className="w-28">파렛트</TableHead>
                  <TableHead className="text-right">금액</TableHead>
                  <TableHead className="text-right">비중</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {computed.rows.map((r) => (
                  <TableRow key={r.name}>
                    <TableCell className="font-medium [font-variant-numeric:tabular-nums]">
                      {r.name}
                    </TableCell>
                    <TableCell className="text-right [font-variant-numeric:tabular-nums]">
                      {formatInt(r.basic)}원
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        className="h-8 [font-variant-numeric:tabular-nums]"
                        value={r.pallets}
                        onChange={(e) => setPallets(r.name, Number(e.target.value))}
                      />
                    </TableCell>
                    <TableCell className="text-right [font-variant-numeric:tabular-nums]">
                      {formatInt(r.cost)}원
                    </TableCell>
                    <TableCell className="text-right [font-variant-numeric:tabular-nums]">
                      {`${(Math.round(r.sharePct * 10) / 10).toLocaleString("ko-KR")}%`}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeRow(r.name)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="bg-muted/40 grid gap-2 rounded-lg border p-4 text-sm sm:grid-cols-2">
            <p>{`총 센터 수: ${formatInt(computed.rows.length)}곳`}</p>
            <p>{`총 파렛트: ${formatInt(computed.totalPallets)}개`}</p>
            <p className="font-semibold sm:col-span-2">{`총 비용: ${formatInt(computed.totalCost)}원 (VAT 별도)`}</p>
            <p>{`평균 단가/파렛트: ${formatInt(computed.avgPerPallet)}원`}</p>
          </div>
        </div>
      </div>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>배정 저장</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label>출고일</Label>
              <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label>메모 (선택)</Label>
              <Input
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="내부 메모"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSaveOpen(false)}>
              취소
            </Button>
            <Button type="button" onClick={submitSave}>
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
