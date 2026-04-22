/**
 * 품목별 "대표 ERP 코드" 선택 공용 유틸.
 *
 * 한 item_id가 gl / glpharm / hnb 여러 ERP 시스템에 등록될 수 있어
 * 단일 표시값이 필요한 UI에서 아래 규칙으로 하나 선택:
 *   1) gl erp_system이 있으면 우선
 *   2) 없으면 첫 번째로 발견된 코드
 *
 * 규칙 변경은 이 파일에서만 하면 모든 사용처 반영됨 (단일 진실 공급원).
 */
export type ErpMappingRow = {
  item_id: number;
  erp_system: string | null;
  erp_code: string | null;
};

export function resolveErpCodeByItem(mappings: ErpMappingRow[]): Map<number, string> {
  const result = new Map<number, string>();
  for (const m of mappings) {
    if (!m.erp_code) continue;
    const existing = result.get(m.item_id);
    if (!existing || m.erp_system === "gl") {
      result.set(m.item_id, m.erp_code);
    }
  }
  return result;
}
