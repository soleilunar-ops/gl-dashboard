import * as XLSX from "xlsx";

import type { LeadTimeRow } from "@/components/logistics/_hooks/useLeadTime";

import { currentStageLabel, getMaxDelay, getStatus } from "./leadTimeCalc";

/** 화면 하단 리스트와 동일 컬럼으로 xlsx 다운로드 (Wings API 없음) */
export function downloadLeadTimeListExcel(rows: LeadTimeRow[]) {
  if (rows.length === 0) return;
  const sheetRows = rows.map((row) => {
    const { max: maxD, hasAny: hasDelay } = getMaxDelay(row);
    const st = getStatus(row);
    const delayLabel = !hasDelay ? "—" : maxD > 0 ? `+${maxD}일` : "정시";
    return {
      발주번호: row.po_number,
      품목명: row.product_name,
      품목코드: row.erp_code ?? "",
      발주일: row.step1_actual ?? "",
      BL번호: row.bl_number ?? "",
      현재단계: currentStageLabel(row.current_step),
      예정입고일: row.step5_expected ?? "",
      실제입고일: row.step5_actual ?? "",
      현재지연: delayLabel,
      상태: st,
    };
  });
  const ws = XLSX.utils.json_to_sheet(sheetRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "수입리드타임");
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  XLSX.writeFile(wb, `수입리드타임_${stamp}.xlsx`);
}
