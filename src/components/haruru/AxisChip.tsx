"use client";

type Axis = "erp" | "coupang" | "both" | "external" | "none";

const AXIS_META: Record<Exclude<Axis, "none">, { label: string; cls: string }> = {
  coupang: {
    label: "쿠팡 B2C",
    cls: "bg-orange-50 text-orange-700 border-orange-200",
  },
  erp: {
    label: "지엘 ERP",
    cls: "bg-blue-50 text-blue-700 border-blue-200",
  },
  both: {
    label: "ERP · 쿠팡",
    cls: "bg-purple-50 text-purple-700 border-purple-200",
  },
  external: {
    label: "외부 신호",
    cls: "bg-slate-50 text-slate-700 border-slate-200",
  },
};

interface AxisChipProps {
  axis?: Axis | null;
}

export function AxisChip({ axis }: AxisChipProps) {
  if (!axis || axis === "none") return null;
  const meta = AXIS_META[axis];
  if (!meta) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}
    >
      {meta.label}
    </span>
  );
}
