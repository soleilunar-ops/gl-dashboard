import { Inbox } from "lucide-react";
import type { EmptyStateProps } from "@/types/shared";

export default function EmptyState({ message = "데이터가 없습니다", icon }: EmptyStateProps) {
  return (
    <div className="text-muted-foreground flex flex-col items-center justify-center py-12">
      {icon ?? <Inbox className="mb-2 h-10 w-10" />}
      <p className="text-sm">{message}</p>
    </div>
  );
}
