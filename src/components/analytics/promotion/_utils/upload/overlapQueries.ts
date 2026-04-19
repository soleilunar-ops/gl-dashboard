/**
 * 기존 live 데이터와 기간 겹침 여부 (헤드 카운트)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export async function countOverlappingDaily(
  supabase: SupabaseClient<Database>,
  periodStart: string,
  periodEnd: string
): Promise<number> {
  const { count, error } = await supabase
    .from("coupang_daily_performance")
    .select("*", { count: "exact", head: true })
    .gte("date", periodStart)
    .lte("date", periodEnd)
    .eq("is_baseline", false);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function countOverlappingDelivery(
  supabase: SupabaseClient<Database>,
  periodStart: string,
  periodEnd: string
): Promise<number> {
  const { count, error } = await supabase
    .from("coupang_delivery_detail")
    .select("*", { count: "exact", head: true })
    .gte("delivery_date", periodStart)
    .lte("delivery_date", periodEnd)
    .eq("is_baseline", false);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function countOverlappingMilkrun(
  supabase: SupabaseClient<Database>,
  yearMonths: string[]
): Promise<number> {
  if (!yearMonths.length) return 0;
  const { count, error } = await supabase
    .from("promotion_milkrun_costs")
    .select("*", { count: "exact", head: true })
    .in("year_month", yearMonths)
    .eq("is_baseline", false);
  if (error) throw new Error(error.message);
  return count ?? 0;
}
