import type { ReactNode } from "react";

// DataTable
export interface Column<T> {
  key: keyof T;
  label: string;
  render?: (_value: T[keyof T], _row: T) => ReactNode;
}

export interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  loading?: boolean;
  emptyMessage?: string;
}

// StatCard
export interface StatCardProps {
  title: string;
  value: string | number;
  change?: number; // 전월 대비 변화율(%)
  icon?: ReactNode;
}

// ChartContainer
export interface ChartContainerProps {
  title: string;
  children: ReactNode;
  loading?: boolean;
  className?: string;
}

// 공통
export interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
}

export interface EmptyStateProps {
  message?: string;
  icon?: ReactNode;
}
