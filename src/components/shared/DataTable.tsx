import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DataTableProps } from "@/types/shared";
import LoadingSpinner from "./LoadingSpinner";
import EmptyState from "./EmptyState";

export default function DataTable<T extends Record<string, any>>({
  data,
  columns,
  loading,
  emptyMessage,
}: DataTableProps<T>) {
  if (loading) return <LoadingSpinner />;
  if (!data.length) return <EmptyState message={emptyMessage} />;

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={String(col.key)}>{col.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, idx) => (
            <TableRow key={idx}>
              {columns.map((col) => (
                <TableCell key={String(col.key)}>
                  {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? "")}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
