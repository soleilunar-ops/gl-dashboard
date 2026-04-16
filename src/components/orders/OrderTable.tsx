"use client";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { roundCurrency } from "@/lib/margin/useMarginCalc";

type OrderStatus = "대기" | "선적중" | "통관" | "입고완료" | "출고대기";

const STATUS_VARIANT: Record<OrderStatus, "default" | "secondary" | "destructive" | "outline"> = {
  대기: "outline",
  선적중: "secondary",
  통관: "default",
  입고완료: "default",
  출고대기: "destructive",
};

export interface OrderRow {
  id: string;
  sku: string;
  name: string;
  qtyOrdered: number;
  qtyShipped: number;
  eta: string;
  status: OrderStatus;
  center: string;
  shipmentQty: number;
  exFinal: number;
  totalUnitCost: number;
  expectedRevenue: number;
  expectedProfit: number;
  marginRate: number;
}

interface OrderTableProps {
  rows: OrderRow[];
  onShipmentChange: (id: string, qty: number) => void;
}

export default function OrderTable({ rows, onShipmentChange }: OrderTableProps) {
  return (
    <div className="rounded-md border">
      <Table className="text-xs">
        <TableHeader>
          <TableRow>
            <TableHead>발주번호</TableHead>
            <TableHead>제품명</TableHead>
            <TableHead>발주/선적</TableHead>
            <TableHead>ETA</TableHead>
            <TableHead>상태</TableHead>
            <TableHead>센터</TableHead>
            <TableHead>분할 정산 환율</TableHead>
            <TableHead>개당 총원가</TableHead>
            <TableHead>출고 예정 수량</TableHead>
            <TableHead>총 기대 수익</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.id}</TableCell>
              <TableCell>
                <div className="font-medium">{row.name}</div>
                <div className="text-muted-foreground text-[10px]">{row.sku}</div>
              </TableCell>
              <TableCell>
                {row.qtyOrdered.toLocaleString()} / {row.qtyShipped.toLocaleString()}
              </TableCell>
              <TableCell>{row.eta}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[row.status]}>{row.status}</Badge>
              </TableCell>
              <TableCell>{row.center}</TableCell>
              <TableCell>{row.exFinal.toFixed(2)}</TableCell>
              <TableCell>{roundCurrency(row.totalUnitCost).toLocaleString()}원</TableCell>
              <TableCell className="w-32">
                <Input
                  type="number"
                  min={0}
                  value={row.shipmentQty}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    onShipmentChange(row.id, Number.isFinite(next) && next >= 0 ? next : 0);
                  }}
                />
              </TableCell>
              <TableCell className="text-right">
                <p className="font-semibold">
                  {roundCurrency(row.expectedRevenue).toLocaleString()}원
                </p>
                <p
                  className={`text-[10px] ${row.marginRate < 0.02 ? "text-red-500" : "text-muted-foreground"}`}
                >
                  순익 {roundCurrency(row.expectedProfit).toLocaleString()}원 /{" "}
                  {(row.marginRate * 100).toFixed(2)}%
                </p>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
