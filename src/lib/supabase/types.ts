// Supabase CLI 자동생성 타입을 re-export
// 팀원은 이 경로에서 import: import type { Database } from '@/lib/supabase/types'
// 30단계에서 auto-types.yml 설정 후 자동 갱신

export type { Database } from "../../../supabase/types";

import type { Database } from "../../../supabase/types";

type PublicSchema = Database["public"];
type TableName = keyof PublicSchema["Tables"];
type ViewName = keyof PublicSchema["Views"];
type TableOrViewName = TableName | ViewName;

// Tables + Views 통합: 테이블/뷰 Row 타입을 한 helper로 접근
export type Tables<T extends TableOrViewName> = T extends TableName
  ? PublicSchema["Tables"][T] extends { Row: infer R }
    ? R
    : never
  : T extends ViewName
    ? PublicSchema["Views"][T] extends { Row: infer R }
      ? R
      : never
    : never;

// 뷰 전용 helper (명시적 사용용)
export type Views<T extends ViewName> = PublicSchema["Views"][T] extends { Row: infer R }
  ? R
  : never;

// INSERT/UPDATE 타입 (테이블 한정)
export type InsertTables<T extends TableName> = PublicSchema["Tables"][T]["Insert"];
export type UpdateTables<T extends TableName> = PublicSchema["Tables"][T]["Update"];

// supabase gen types 생성본의 네이밍과 일관성 유지 alias
export type TablesInsert<T extends TableName> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends TableName> = PublicSchema["Tables"][T]["Update"];
