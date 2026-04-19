"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/client";
import type { InsertTables } from "@/lib/supabase/types";
import {
  fetchSeasonConfig,
  inferSeasonForIsoDate,
  pickDefaultSeason,
} from "@/components/analytics/promotion/_utils/upload/seasonAssign";

type AdRow = {
  contract_no: string;
  start_date: string;
  end_date: string;
  budget: string;
  paid_amount: string;
};

const emptyRow = (): AdRow => ({
  contract_no: "",
  start_date: "",
  end_date: "",
  budget: "",
  paid_amount: "",
});

export default function AdCostForm({ onSaved }: { onSaved?: () => void }) {
  const [rows, setRows] = useState<AdRow[]>([emptyRow()]);
  const [saving, setSaving] = useState(false);

  const addRow = () => setRows((r) => [...r, emptyRow()]);
  const removeRow = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));

  const update = (i: number, patch: Partial<AdRow>) => {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  };

  const loadSeason = useCallback(async () => {
    const supabase = createClient();
    return fetchSeasonConfig(supabase);
  }, []);

  const [seasonCfg, setSeasonCfg] = useState<Awaited<ReturnType<typeof fetchSeasonConfig>>>([]);
  useEffect(() => {
    void loadSeason()
      .then(setSeasonCfg)
      .catch(() => setSeasonCfg([]));
  }, [loadSeason]);

  const fallbackSeason = useMemo(() => pickDefaultSeason(seasonCfg), [seasonCfg]);

  const saveAll = async () => {
    setSaving(true);
    try {
      const supabase = createClient();
      const payload: InsertTables<"promotion_ad_costs">[] = [];
      for (const r of rows) {
        const cn = Number(String(r.contract_no).replace(/\D/g, ""));
        if (!Number.isFinite(cn) || cn <= 0) continue;
        if (!r.start_date || !r.end_date) continue;
        const ym = r.start_date.slice(0, 7);
        const budget = Number(String(r.budget).replace(/,/g, "")) || null;
        const paid = Number(String(r.paid_amount).replace(/,/g, "")) || null;
        const season =
          inferSeasonForIsoDate(r.start_date, seasonCfg, fallbackSeason) ?? fallbackSeason ?? null;
        payload.push({
          contract_no: cn,
          start_date: r.start_date,
          end_date: r.end_date,
          budget,
          paid_amount: paid,
          year_month: ym,
          season,
          is_baseline: false,
        });
      }
      if (!payload.length) {
        toast.error("저장할 유효한 행이 없습니다. 계약번호·일자를 확인해 주세요.");
        return;
      }
      const { error } = await supabase.from("promotion_ad_costs").insert(payload as never);
      if (error) throw new Error(error.message);
      toast.success(`${payload.length}건 저장되었습니다.`);
      setRows([emptyRow()]);
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card space-y-3 rounded-xl border border-orange-500/40 p-4 shadow-sm ring-1 ring-orange-500/25">
      <h3 className="text-base font-semibold">광고비 (수동 입력)</h3>
      <p className="text-muted-foreground text-xs">
        쿠팡 허브 광고비 화면을 참고해 계약번호·기간·예산·부담 금액을 입력합니다. year_month는
        시작일 기준으로 자동 설정됩니다.
      </p>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">계약번호</TableHead>
              <TableHead className="w-[140px]">시작일</TableHead>
              <TableHead className="w-[140px]">종료일</TableHead>
              <TableHead className="w-[140px]">계약 예산</TableHead>
              <TableHead className="w-[140px]">부담 금액</TableHead>
              <TableHead className="w-[72px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Input
                    value={r.contract_no}
                    onChange={(e) => update(i, { contract_no: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="date"
                    value={r.start_date}
                    onChange={(e) => update(i, { start_date: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="date"
                    value={r.end_date}
                    onChange={(e) => update(i, { end_date: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={r.budget}
                    onChange={(e) => update(i, { budget: e.target.value })}
                    placeholder="원"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={r.paid_amount}
                    onChange={(e) => update(i, { paid_amount: e.target.value })}
                    placeholder="원"
                  />
                </TableCell>
                <TableCell>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeRow(i)}>
                    삭제
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          + 행 추가
        </Button>
        <Button type="button" size="sm" disabled={saving} onClick={() => void saveAll()}>
          일괄 저장
        </Button>
      </div>
    </div>
  );
}
