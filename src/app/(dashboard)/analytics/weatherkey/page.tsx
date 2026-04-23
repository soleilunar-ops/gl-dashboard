import { Suspense } from "react";
import WeatherkeyDashboard from "@/components/analytics/weatherkey/WeatherkeyDashboard";

export const dynamic = "force-dynamic";

export default function WeatherkeyPage() {
  return (
    <Suspense fallback={null}>
      <WeatherkeyDashboard />
    </Suspense>
  );
}
