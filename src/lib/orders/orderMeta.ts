// v6 ERP 시스템 코드와 일치시킴 (2026-04-17 rename_gl_farm_to_gl_pharm 마이그 반영)
// 이전: "glpharm" → 현재: "gl_pharm" (item_erp_mapping.erp_system / orders.erp_system과 동일)
export type OrderCompanyCode = "gl" | "gl_pharm" | "hnb";

export type OrderSourceKind = "erp_api" | "excel_upload" | "dashboard_manual";

export interface OrderCompanyOption {
  code: OrderCompanyCode;
  label: string;
}

export const ORDER_COMPANIES: OrderCompanyOption[] = [
  { code: "gl", label: "지엘" },
  { code: "gl_pharm", label: "지엘팜" },
  { code: "hnb", label: "에이치앤비" },
];

export function companyLabel(code: OrderCompanyCode): string {
  const found = ORDER_COMPANIES.find((item) => item.code === code);
  return found?.label ?? "지엘팜";
}

/**
 * item_erp_mapping.erp_system 값 — v6부터 companyCode와 동일.
 * (슬아 원안 시점에는 glpharm → gl_farm 매핑 로직이 있었으나, 2026-04-17 rename_gl_farm_to_gl_pharm 마이그 적용으로 단순화)
 */
export function erpMappingSystemCode(companyCode: OrderCompanyCode): OrderCompanyCode {
  return companyCode;
}

export function sourceKindLabel(kind: OrderSourceKind): string {
  if (kind === "erp_api") {
    return "ERP 연동";
  }
  if (kind === "excel_upload") {
    return "엑셀 업로드";
  }
  return "수동 입력";
}

// 변경 이유: source/memo 문자열 하나로 기업/자료출처를 저장·복원해 스키마 변경 없이 필터를 지원함.
// 2단에서는 orders.memo 필드에 이 포맷으로 기록됨.
export function composeOrderSource(companyCode: OrderCompanyCode, kind: OrderSourceKind): string {
  return `orders:${companyCode}:${kind}`;
}

export function parseOrderSource(source: string | null | undefined): {
  companyCode: OrderCompanyCode;
  kind: OrderSourceKind;
} {
  if (typeof source === "string" && source.startsWith("orders:")) {
    const [, rawCompany, rawKind] = source.split(":");
    const companyCode: OrderCompanyCode =
      rawCompany === "gl" || rawCompany === "hnb" || rawCompany === "gl_pharm"
        ? rawCompany
        : "gl_pharm";
    const kind: OrderSourceKind =
      rawKind === "erp_api" || rawKind === "excel_upload" || rawKind === "dashboard_manual"
        ? rawKind
        : "erp_api";
    return { companyCode, kind };
  }
  if (source === "excel_upload") {
    return { companyCode: "gl_pharm", kind: "excel_upload" };
  }
  if (source === "dashboard_manual") {
    return { companyCode: "gl_pharm", kind: "dashboard_manual" };
  }
  return { companyCode: "gl_pharm", kind: "erp_api" };
}
