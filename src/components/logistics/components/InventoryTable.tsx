"use client";

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";

export interface InventoryViewRow {
  id: number;
  seq_no: number;
  item_name: string;
  manufacture_year?: string | null;
  production_type: string | null;
  erp_code: string | null;
  coupang_sku_id?: string | null;
  current_qty: number;
  erp_qty: number;
  diff: number;
  cost_price: number;
  stock_amount: number;
  in_7days: number;
  out_7days: number;
}

interface InventoryTableProps {
  rows: InventoryViewRow[];
  onSelectItem: (itemId: number) => void;
}

export function InventoryTable({ rows, onSelectItem }: InventoryTableProps) {
  const wonFormatter = new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  });

  const columns: ColumnDef<InventoryViewRow>[] = [
    { accessorKey: "seq_no", header: "순번" },
    {
      accessorKey: "item_name",
      header: "품목명",
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.item_name}</p>
          <p className="text-xs text-gray-500">{row.original.erp_code ?? "-"}</p>
        </div>
      ),
    },
    {
      accessorKey: "production_type",
      header: "유형",
      cell: ({ row }) => {
        const type = row.original.production_type ?? "-";
        const className =
          type === "국내생산"
            ? "bg-emerald-100 text-emerald-700"
            : type === "수입"
              ? "bg-blue-100 text-blue-700"
              : "bg-slate-100 text-slate-600";
        return (
          <span className={`rounded-full px-2 py-1 text-xs font-medium ${className}`}>{type}</span>
        );
      },
    },
    {
      accessorKey: "current_qty",
      header: "실물재고",
      cell: ({ row }) => row.original.current_qty.toLocaleString(),
    },
    {
      accessorKey: "erp_qty",
      header: "ERP재고",
      cell: ({ row }) => row.original.erp_qty.toLocaleString(),
    },
    {
      accessorKey: "diff",
      header: "차이",
      cell: ({ row }) => {
        const value = row.original.diff;
        const className =
          value > 0 ? "text-emerald-600" : value < 0 ? "text-rose-600" : "text-slate-500";
        return <span className={className}>{value.toLocaleString()}</span>;
      },
    },
    {
      accessorKey: "stock_amount",
      header: "재고금액",
      cell: ({ row }) => wonFormatter.format(row.original.stock_amount),
    },
    {
      accessorKey: "in_7days",
      header: "입고예정(7일)",
      cell: ({ row }) => row.original.in_7days.toLocaleString(),
    },
    {
      accessorKey: "out_7days",
      header: "출고예정(7일)",
      cell: ({ row }) => row.original.out_7days.toLocaleString(),
    },
  ];

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize: 50,
      },
    },
  });

  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id} className="border-b px-3 py-2 text-left">
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className="cursor-pointer border-b hover:bg-slate-50"
              onClick={() => onSelectItem(row.original.id)}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-3 py-2">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-between border-t px-3 py-2 text-sm">
        <p>
          {table.getState().pagination.pageIndex + 1} / {table.getPageCount() || 1} 페이지
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded border px-3 py-1 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            이전
          </button>
          <button
            type="button"
            className="rounded border px-3 py-1 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            다음
          </button>
        </div>
      </div>
    </div>
  );
}
