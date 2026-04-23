"use client";

import { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/client";

interface UploadRow {
  id: number;
  file_name: string;
  category: string | null;
  target_table: string | null;
  total_rows: number | null;
  inserted_rows: number | null;
  status: string | null;
  uploaded_at: string | null;
  notes: string | null;
}

interface Props {
  refreshKey: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  basic_operation_rocket: "기본 물류지표",
  daily_performance: "일간 종합 성과",
  fill_rate: "납품률",
  noncompliant_delivery: "입고기준 미준수",
  regional_sales: "지역별 판매",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function statusBadge(status: string | null): { label: string; className: string } {
  switch (status) {
    case "received":
      return { label: "접수", className: "bg-blue-50 text-blue-700 border-blue-200" };
    case "processing":
      return { label: "처리 중", className: "bg-amber-50 text-amber-700 border-amber-200" };
    case "completed":
      return { label: "완료", className: "bg-green-50 text-green-700 border-green-200" };
    case "failed":
      return { label: "실패", className: "bg-red-50 text-red-700 border-red-200" };
    default:
      return { label: status ?? "—", className: "bg-gray-50 text-gray-600 border-gray-200" };
  }
}

export function UploadHistory({ refreshKey }: Props) {
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"upload" | "export">("upload");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const sb = createClient();
      const { data } = await sb
        .from("excel_uploads")
        .select(
          "id, file_name, category, target_table, total_rows, inserted_rows, status, uploaded_at, notes"
        )
        .order("uploaded_at", { ascending: false })
        .limit(30);
      setRows((data ?? []) as UploadRow[]);
      setLoading(false);
    })();
  }, [refreshKey]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2 border-b">
        <button
          type="button"
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            tab === "upload"
              ? "border-orange-500 text-orange-600"
              : "border-transparent text-gray-500 hover:text-gray-800"
          }`}
          onClick={() => setTab("upload")}
        >
          📥 업로드 이력 ({rows.length})
        </button>
        <button
          type="button"
          className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            tab === "export"
              ? "border-orange-500 text-orange-600"
              : "border-transparent text-gray-500 hover:text-gray-800"
          }`}
          onClick={() => setTab("export")}
        >
          📤 출력 이력
        </button>
      </div>

      {tab === "upload" ? (
        loading ? (
          <div className="py-6 text-center text-sm text-gray-400">불러오는 중...</div>
        ) : rows.length === 0 ? (
          <div className="py-6 text-center text-sm text-gray-400">아직 업로드 이력이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>파일명</TableHead>
                  <TableHead>카테고리</TableHead>
                  <TableHead>대상 테이블</TableHead>
                  <TableHead className="text-right">행수</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>업로드 시각</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const b = statusBadge(r.status);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="max-w-[280px] truncate font-medium text-gray-900">
                        {r.file_name}
                      </TableCell>
                      <TableCell className="text-sm">
                        {CATEGORY_LABELS[r.category ?? ""] ?? r.category ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-gray-600">
                        {r.target_table ?? "—"}
                      </TableCell>
                      <TableCell className="text-right [font-variant-numeric:tabular-nums]">
                        {r.total_rows?.toLocaleString() ?? "—"}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded border px-2 py-0.5 text-xs ${b.className}`}
                        >
                          {b.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {formatDate(r.uploaded_at)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )
      ) : (
        <div className="rounded-lg border border-dashed border-gray-200 py-12 text-center text-sm text-gray-500">
          출력 이력은 각 화면에서 "엑셀 추출" 클릭 시 자동으로 기록될 예정입니다.
          <br />
          <span className="text-xs text-gray-400">
            (현재: 주간 리포트 · 주문 관리 · 수입 리드타임 · 쿠팡 밀크런 화면의 엑셀 추출)
          </span>
        </div>
      )}
    </div>
  );
}
