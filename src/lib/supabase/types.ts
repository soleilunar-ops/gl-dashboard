// Supabase CLI 자동생성 타입을 re-export
// 팀원은 이 경로에서 import: import type { Database } from '@/lib/supabase/types'
// 30단계에서 auto-types.yml 설정 후 자동 갱신

export type { Database } from "../../../supabase/types";

// 자주 쓰는 타입 단축
import type { Database } from "../../../supabase/types";

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type InsertTables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type UpdateTables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
