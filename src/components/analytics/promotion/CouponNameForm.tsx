"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { createClient } from "@/lib/supabase/client";
import { usePendingCouponNames } from "@/components/analytics/promotion/_hooks/usePendingCouponNames";

const CATEGORIES = [
  "즉시할인",
  "Sweet Shop",
  "방한용품",
  "쿠팡 체험단",
  "와우페스티벌",
  "기타",
] as const;

type Editable = {
  contract_no: number;
  start_date: string | null;
  end_date: string | null;
  paid_amount: number | null;
  coupon_name: string;
  coupon_category: string;
};

export default function CouponNameForm({ onSaved }: { onSaved?: () => void }) {
  const { rows, loading, refresh, pendingCount } = usePendingCouponNames();
  const [edited, setEdited] = useState<Record<number, Editable>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const next: Record<number, Editable> = {};
    for (const r of rows) {
      next[r.contract_no] = {
        contract_no: r.contract_no,
        start_date: r.start_date,
        end_date: r.end_date,
        paid_amount: r.paid_amount,
        coupon_name: r.coupon_name ?? "",
        coupon_category: r.coupon_category ?? CATEGORIES[0],
      };
    }
    setEdited(next);
  }, [rows]);

  const patch = (contractNo: number, patch: Partial<Editable>) => {
    setEdited((m) => ({
      ...m,
      [contractNo]: { ...m[contractNo]!, ...patch },
    }));
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      const supabase = createClient();
      for (const r of Object.values(edited)) {
        if (!r.coupon_name.trim()) continue;
        const { error } = await supabase
          .from("promotion_coupon_contracts")
          .update({
            coupon_name: r.coupon_name.trim(),
            coupon_category: r.coupon_category,
            updated_at: new Date().toISOString(),
          } as never)
          .eq("contract_no", r.contract_no)
          .eq("is_baseline", false);
        if (error) throw new Error(error.message);
      }
      toast.success("쿠폰명·종류가 저장되었습니다.");
      await refresh();
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card space-y-3 rounded-xl border border-amber-900/40 p-4 shadow-sm ring-1 ring-amber-900/25">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">쿠폰명·종류 (매칭)</h3>
          <p className="text-muted-foreground text-xs">
            계약은 업로드되었으나 쿠폰명이 비어 있는 건만 표시됩니다.
          </p>
        </div>
        <Badge variant="secondary">미입력 {pendingCount}건</Badge>
      </div>
      {loading ? (
        <p className="text-muted-foreground text-sm">불러오는 중…</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>계약번호</TableHead>
                <TableHead>시작일</TableHead>
                <TableHead>종료일</TableHead>
                <TableHead>부담금액</TableHead>
                <TableHead>쿠폰명</TableHead>
                <TableHead>종류</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const e = edited[r.contract_no];
                if (!e) return null;
                return (
                  <TableRow key={r.contract_no}>
                    <TableCell>{r.contract_no}</TableCell>
                    <TableCell>{r.start_date ?? "—"}</TableCell>
                    <TableCell>{r.end_date ?? "—"}</TableCell>
                    <TableCell>{(r.paid_amount ?? 0).toLocaleString("ko-KR")}</TableCell>
                    <TableCell>
                      <Input
                        value={e.coupon_name}
                        onChange={(ev) => patch(r.contract_no, { coupon_name: ev.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={e.coupon_category}
                        onValueChange={(v) => patch(r.contract_no, { coupon_category: v })}
                      >
                        <SelectTrigger className="w-[160px]" size="sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <Button
        type="button"
        size="sm"
        disabled={saving || !rows.length}
        onClick={() => void saveAll()}
      >
        일괄 저장
      </Button>
    </div>
  );
}
