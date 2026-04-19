import { isMissingRelationError } from "./internals";
import { T_ALLOC, type SupabaseBrowserClient } from "./types";

export async function remove(
  supabase: SupabaseBrowserClient,
  id: number
): Promise<{ ok: true } | { ok: false; message: string; missingTable: boolean }> {
  if (!Number.isFinite(id) || id <= 0) {
    return { ok: false, message: "유효하지 않은 id입니다.", missingTable: false };
  }
  const { data: deleted, error } = await supabase.from(T_ALLOC).delete().eq("id", id).select("id");
  if (error) {
    const msg = error.message;
    return { ok: false, message: msg, missingTable: isMissingRelationError(msg) };
  }
  const delRows = deleted as { id: number }[] | null;
  if (!delRows?.length) {
    return { ok: false, message: "데이터를 찾을 수 없습니다.", missingTable: false };
  }
  return { ok: true };
}
