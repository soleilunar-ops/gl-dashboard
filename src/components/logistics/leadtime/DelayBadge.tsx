import { Badge } from "@/components/ui/badge";
import { calcDelay } from "@/lib/logistics/leadTimeCalc";

export function DelayBadge({ actual, expected }: { actual: string; expected: string }) {
  const d = calcDelay(actual, expected);
  if (d > 0)
    return (
      <Badge variant="destructive" className="text-xs">
        +{d}일 지연
      </Badge>
    );
  if (d === 0)
    return <Badge className="bg-green-600 text-xs text-white hover:bg-green-600">정시</Badge>;
  return (
    <Badge className="bg-green-600 text-xs text-white hover:bg-green-600">
      {Math.abs(d)}일 빠름
    </Badge>
  );
}
