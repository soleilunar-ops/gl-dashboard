import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

import { EcountMappingError, type ParsedLedgerRow } from "./types";

type OrderInsert = {
  item_id: number;
  tx_date: string;
  tx_type: string;
  erp_system: string;
  source_table: string;
  erp_code: string;
  erp_tx_no: string;
  erp_tx_line_no: number;
  counterparty: string | null;
  memo: string | null;
  quantity: number;
};

export type PersistResult = {
  dry_run: boolean;
  rows: ParsedLedgerRow[];
  saved_count: number;
  item_id: number;
  erp_system: string;
  message: string;
};

/**
 * 파싱된 재고수불부 행을 orders 테이블로 적재 (HANDOVER v6 정책).
 * - item_erp_mapping 미등록 erp_code → EcountMappingError (422 + hint)
 * - dryRun=true 이면 DB write 생략, rows 미리보기 최대 20건 반환
 * - 기타 DB 에러 → 원본 Error bubble-up
 *
 * 144 마스터 불변 원칙: items 자동 생성 금지, item_erp_mapping에서만 역매칭
 * orders UNIQUE: (erp_system, erp_tx_no, erp_tx_line_no)
 */
export async function persistOrdersToSupabase(
  parsed: ParsedLedgerRow[],
  itemCode: string,
  opts: { dryRun: boolean; client?: SupabaseClient }
): Promise<PersistResult> {
  // 배치 스크립트(service-role)가 client를 주입하면 그대로 사용, Next API 경로에서는 기본 server client 생성
  const supabase = opts.client ?? (await createClient());

  const { data: mappingRow, error: mappingErr } = await supabase
    .from("item_erp_mapping")
    .select("item_id, erp_system")
    .eq("erp_code", itemCode)
    .order("erp_system", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (mappingErr) throw new Error(`item_erp_mapping 조회 실패: ${mappingErr.message}`);

  if (!mappingRow) {
    throw new EcountMappingError(
      `ERP 코드 "${itemCode}"가 item_erp_mapping에 등록되지 않았습니다.`,
      "144개 마스터 품목에 매핑되지 않은 코드는 적재할 수 없습니다 (HANDOVER v6 원칙 3번). PM에게 매핑 등록을 요청하세요."
    );
  }

  const resolvedItemId = mappingRow.item_id;
  const erpSystem = mappingRow.erp_system;

  const orderRows: OrderInsert[] = parsed.flatMap((row, idx) => {
    const txNo = `ECOUNT_${row.date}_${row.counterparty || "UNKNOWN"}`;
    const out: OrderInsert[] = [];
    if (row.in_qty > 0) {
      out.push({
        item_id: resolvedItemId,
        tx_date: row.date,
        tx_type: "purchase",
        erp_system: erpSystem,
        source_table: "ecount_ledger",
        erp_code: itemCode,
        erp_tx_no: txNo,
        erp_tx_line_no: idx * 2 + 1,
        counterparty: row.counterparty || null,
        memo: row.note || null,
        quantity: row.in_qty,
      });
    }
    if (row.out_qty > 0) {
      out.push({
        item_id: resolvedItemId,
        tx_date: row.date,
        tx_type: "sale",
        erp_system: erpSystem,
        source_table: "ecount_ledger",
        erp_code: itemCode,
        erp_tx_no: txNo,
        erp_tx_line_no: idx * 2 + 2,
        counterparty: row.counterparty || null,
        memo: row.note || null,
        quantity: row.out_qty,
      });
    }
    return out;
  });

  if (opts.dryRun) {
    return {
      dry_run: true,
      rows: parsed.slice(0, 20),
      saved_count: orderRows.length,
      item_id: resolvedItemId,
      erp_system: erpSystem,
      message: `DRY RUN 성공: ${orderRows.length}건 추출됨 (DB 저장 안 함)`,
    };
  }

  const { error: upsertErr } = await supabase.from("orders").upsert(orderRows, {
    onConflict: "erp_system,erp_tx_no,erp_tx_line_no",
    ignoreDuplicates: true,
  });

  if (upsertErr) throw new Error(upsertErr.message);

  return {
    dry_run: false,
    rows: parsed,
    saved_count: orderRows.length,
    item_id: resolvedItemId,
    erp_system: erpSystem,
    message: `${orderRows.length}건 저장 완료 (item_id: ${resolvedItemId}, system: ${erpSystem})`,
  };
}
