import type { LoadingSpinnerProps } from "@/types/shared";
import { cn } from "@/lib/utils";

const sizeMap = {
  sm: "h-4 w-4",
  md: "h-8 w-8",
  lg: "h-12 w-12",
};

export default function LoadingSpinner({ size = "md" }: LoadingSpinnerProps) {
  return (
    <div className="flex items-center justify-center p-4">
      <div
        className={cn(
          "border-muted border-t-primary animate-spin rounded-full border-2",
          sizeMap[size]
        )}
      />
    </div>
  );
}
