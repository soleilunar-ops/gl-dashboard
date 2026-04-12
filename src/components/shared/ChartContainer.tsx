import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ChartContainerProps } from "@/types/shared";
import LoadingSpinner from "./LoadingSpinner";

export default function ChartContainer({
  title,
  children,
  loading,
  className,
}: ChartContainerProps) {
  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>{loading ? <LoadingSpinner /> : children}</CardContent>
    </Card>
  );
}
