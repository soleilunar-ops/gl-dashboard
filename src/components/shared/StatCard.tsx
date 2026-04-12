import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { StatCardProps } from "@/types/shared";

export default function StatCard({ title, value, change, icon }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
        {change !== undefined && (
          <p
            className={cn(
              "text-xs",
              change > 0 ? "text-green-600" : change < 0 ? "text-red-600" : "text-muted-foreground"
            )}
          >
            {change > 0 ? "+" : ""}
            {change}% 전월 대비
          </p>
        )}
      </CardContent>
    </Card>
  );
}
