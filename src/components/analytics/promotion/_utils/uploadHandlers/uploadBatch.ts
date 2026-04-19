/**
 * Supabase insert 분할 (대량 업로드)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

const BATCH = 400;

type PublicTable = keyof Database["public"]["Tables"];

export async function insertInBatches(
  supabase: SupabaseClient<Database>,
  table: PublicTable,
  rows: Record<string, unknown>[],
  errors: string[]
): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await supabase.from(table).insert(chunk as never);
    if (error) {
      errors.push(`${i + 1}번째 행부터 일괄 저장 중 오류: ${error.message}`);
      break;
    }
    inserted += chunk.length;
  }
  return inserted;
}
