"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import {
  fetchSeasonConfig,
  inferSeasonForYm,
  pickDefaultSeason,
} from "@/components/analytics/promotion/_utils/upload/seasonAssign";

function ymOptions(count = 24): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < count; i++) {
    const t = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export default function PremiumDataForm({ onSaved }: { onSaved?: () => void }) {
  const options = useMemo(() => ymOptions(), []);
  const [yearMonth, setYearMonth] = useState(options[0] ?? "");
  const [amount, setAmount] = useState("1650000");
  const [saving, setSaving] = useState(false);
  const [seasonCfg, setSeasonCfg] = useState<Awaited<ReturnType<typeof fetchSeasonConfig>>>([]);

  const load = useCallback(async () => {
    const supabase = createClient();
    const cfg = await fetchSeasonConfig(supabase);
    setSeasonCfg(cfg);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!yearMonth) {
      toast.error("연월을 선택해 주세요.");
      return;
    }
    const amt = Number(String(amount).replace(/,/g, ""));
    if (!Number.isFinite(amt)) {
      toast.error("금액이 올바르지 않습니다.");
      return;
    }
    const supabase = createClient();
    const fallback = pickDefaultSeason(seasonCfg);
    const season = inferSeasonForYm(yearMonth, seasonCfg, fallback) ?? fallback;

    const { data: existing } = await supabase
      .from("promotion_premium_data_costs")
      .select("id")
      .eq("year_month", yearMonth)
      .eq("is_baseline", false)
      .maybeSingle();

    if (existing?.id) {
      const ok = window.confirm("해당 월 라이브 데이터가 이미 있습니다. 덮어쓸까요?");
      if (!ok) return;
    }

    setSaving(true);
    try {
      const { error: delErr } = await supabase
        .from("promotion_premium_data_costs")
        .delete()
        .eq("year_month", yearMonth)
        .eq("is_baseline", false);
      if (delErr) throw new Error(delErr.message);
      const { error } = await supabase.from("promotion_premium_data_costs").insert({
        year_month: yearMonth,
        amount: amt,
        season,
        is_baseline: false,
      } as never);
      if (error) throw new Error(error.message);
      toast.success("프리미엄 데이터 비용이 저장되었습니다.");
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card space-y-3 rounded-xl border border-red-600/40 p-4 shadow-sm ring-1 ring-red-600/25">
      <h3 className="text-base font-semibold">프리미엄 데이터 (수동 입력)</h3>
      <p className="text-muted-foreground text-xs">
        허브 &quot;프리미엄 데이터&quot; 정산 월·매출액(1,650,000원 등)을 반영합니다. 동일
        year_month는 UPSERT 됩니다.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs">정산 연월</p>
          <Select value={yearMonth} onValueChange={setYearMonth}>
            <SelectTrigger className="w-[160px]" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((ym) => (
                <SelectItem key={ym} value={ym}>
                  {ym}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs">금액(원)</p>
          <Input className="w-[180px]" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <Button type="button" size="sm" disabled={saving} onClick={() => void save()}>
          저장
        </Button>
      </div>
    </div>
  );
}
