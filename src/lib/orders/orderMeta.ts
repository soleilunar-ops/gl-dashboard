export type OrderCompanyCode = "gl" | "glpharm" | "hnb";

export type OrderSourceKind = "erp_api" | "excel_upload" | "dashboard_manual";

export interface OrderCompanyOption {
  code: OrderCompanyCode;
  label: string;
}

export const ORDER_COMPANIES: OrderCompanyOption[] = [
  { code: "gl", label: "지엘" },
  { code: "glpharm", label: "지엘팜" },
  { code: "hnb", label: "에이치앤비" },
];

export function companyLabel(code: OrderCompanyCode): string {
  const found = ORDER_COMPANIES.find((item) => item.code === code);
  return found?.label ?? "지엘팜";
}

/** item_erp_mapping.erp_system 값 — 지엘팜 동기화는 gl_farm 행만 사용 */
export function erpMappingSystemCode(companyCode: OrderCompanyCode): string {
  if (companyCode === "glpharm") {
    return "gl_farm";
  }
  if (companyCode === "gl") {
    return "gl";
  }
  return "hnb";
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

// 변경 이유: source 문자열 하나로 기업/자료출처를 저장·복원해 스키마 변경 없이 필터를 지원합니다.
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
      rawCompany === "gl" || rawCompany === "hnb" || rawCompany === "glpharm"
        ? rawCompany
        : "glpharm";
    const kind: OrderSourceKind =
      rawKind === "erp_api" || rawKind === "excel_upload" || rawKind === "dashboard_manual"
        ? rawKind
        : "erp_api";
    return { companyCode, kind };
  }
  if (source === "excel_upload") {
    return { companyCode: "glpharm", kind: "excel_upload" };
  }
  if (source === "dashboard_manual") {
    return { companyCode: "glpharm", kind: "dashboard_manual" };
  }
  return { companyCode: "glpharm", kind: "erp_api" };
}
