import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  composeOrderSource,
  erpMappingSystemCode,
  type OrderCompanyCode,
} from "@/lib/orders/orderMeta";

// 변경 이유: ORDERS 카드에서 지엘팜 ERP 구매현황을 서버에서 안전하게 동기화하기 위해 API 라우트를 추가했습니다.
interface ZoneData {
  ZONE: string;
  DOMAIN: string;
}

interface EcountError {
  Code?: number;
  Message?: string;
  MessageDetail?: string;
}

interface EcountResponse<TData> {
  Status?: string;
  Data?: TData | null;
  Error?: EcountError | null;
}

interface LoginData {
  SESSION_ID?: string;
  SessionId?: string;
}

type RecordLike = Record<string, unknown>;

interface SyncRequestBody {
  fromDate?: string;
  toDate?: string;
  companyCode?: OrderCompanyCode;
}

interface PurchaseRow {
  product_id: string | null;
  erp_code: string | null;
  erp_product_name: string | null;
  supplier_name: string | null;
  purchase_date: string;
  erp_date: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
  erp_ref: string | null;
  source: string;
}

interface ItemErpMappingRow {
  product_id: string;
  erp_code: string;
}

function toCompactDate(isoDate: string): string {
  return isoDate.replaceAll("-", "");
}

function parseDate(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  const normalized = value.replaceAll(".", "-").replaceAll("/", "-").trim();
  if (/^\d{8}$/.test(normalized)) {
    return `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }
  return null;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.replaceAll(",", ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pickString(source: RecordLike, keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function pickDate(source: RecordLike, keys: string[]): string | null {
  for (const key of keys) {
    const parsed = parseDate(source[key]);
    if (parsed) {
      return parsed;
    }
  }
  return null;
}

function pickNumber(source: RecordLike, keys: string[]): number | null {
  for (const key of keys) {
    const parsed = parseNumber(source[key]);
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
}

function extractRecords(data: unknown): RecordLike[] {
  if (Array.isArray(data)) {
    return data.filter((row): row is RecordLike => typeof row === "object" && row !== null);
  }
  if (!data || typeof data !== "object") {
    return [];
  }
  const wrapper = data as RecordLike;
  const candidates: unknown[] = [
    wrapper.Result,
    wrapper.Results,
    wrapper.List,
    wrapper.PurchaseList,
    wrapper.Items,
    wrapper.Data,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter((row): row is RecordLike => typeof row === "object" && row !== null);
    }
  }
  return [];
}

async function postJson<TData>(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as EcountResponse<TData>;
  return { response, payload };
}

function buildHost(zone: string, domain: string) {
  return `https://oapi${zone}${domain}`;
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const comCode = process.env.ECOUNT_GLPHARM_COM_CODE ?? "650418";
  const userId = process.env.ECOUNT_GLPHARM_USER_ID;
  const userPw = process.env.ECOUNT_GLPHARM_USER_PW;
  const apiKey = process.env.ECOUNT_GLPHARM_API_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { message: "Supabase 서버 키가 없어 동기화를 실행할 수 없습니다." },
      { status: 500 }
    );
  }
  if (!userId || !userPw || !apiKey) {
    return NextResponse.json(
      {
        message:
          "ECOUNT_GLPHARM_USER_ID / ECOUNT_GLPHARM_USER_PW / ECOUNT_GLPHARM_API_KEY 환경변수를 설정해주세요.",
      },
      { status: 500 }
    );
  }

  let body: SyncRequestBody = {};
  try {
    const parsed = (await request.json()) as SyncRequestBody;
    body = parsed ?? {};
  } catch {
    body = {};
  }

  const today = new Date();
  const defaultFrom = new Date(today);
  defaultFrom.setDate(defaultFrom.getDate() - 30);
  const fromDate = body.fromDate ?? defaultFrom.toISOString().slice(0, 10);
  const toDate = body.toDate ?? today.toISOString().slice(0, 10);
  const companyCode =
    body.companyCode === "gl" || body.companyCode === "glpharm" || body.companyCode === "hnb"
      ? body.companyCode
      : "glpharm";
  if (companyCode !== "glpharm") {
    return NextResponse.json(
      {
        message:
          "현재 ERP 연동은 지엘팜만 지원됩니다. 다른 기업은 엑셀 업로드 또는 수동 입력을 사용하세요.",
      },
      { status: 400 }
    );
  }

  try {
    const zoneRes = await postJson<ZoneData>("https://oapi.ecount.com/OAPI/V2/Zone", {
      COM_CODE: comCode,
    });
    if (!zoneRes.response.ok || zoneRes.payload.Status !== "200" || !zoneRes.payload.Data) {
      return NextResponse.json(
        {
          message: "Zone 조회 실패",
          detail:
            zoneRes.payload.Error?.Message ??
            `HTTP ${zoneRes.response.status} / Status ${zoneRes.payload.Status ?? "unknown"}`,
        },
        { status: 502 }
      );
    }

    const host = buildHost(zoneRes.payload.Data.ZONE, zoneRes.payload.Data.DOMAIN);
    const loginRes = await postJson<LoginData>(`${host}/OAPI/V2/OAPILogin`, {
      COM_CODE: comCode,
      USER_ID: userId,
      USER_PW: userPw,
      API_CERT_KEY: apiKey,
      ZONE: zoneRes.payload.Data.ZONE,
      LAN_TYPE: "ko-KR",
    });
    const sessionId = loginRes.payload.Data?.SESSION_ID ?? loginRes.payload.Data?.SessionId;
    if (!loginRes.response.ok || loginRes.payload.Status !== "200" || !sessionId) {
      return NextResponse.json(
        {
          message: "ERP 로그인 실패",
          detail:
            loginRes.payload.Error?.Message ??
            `HTTP ${loginRes.response.status} / Status ${loginRes.payload.Status ?? "unknown"}`,
        },
        { status: 502 }
      );
    }

    const listPath =
      process.env.ECOUNT_GLPHARM_PURCHASE_LIST_PATH ?? "/OAPI/V2/Purchases/GetListPurchases";
    const purchasesRes = await postJson<unknown>(
      `${host}${listPath}?SESSION_ID=${encodeURIComponent(sessionId)}`,
      {
        COM_CODE: comCode,
        USER_ID: userId,
        SESSION_ID: sessionId,
        BASE_DATE_FROM: toCompactDate(fromDate),
        BASE_DATE_TO: toCompactDate(toDate),
        LAN_TYPE: "ko-KR",
      }
    );
    if (!purchasesRes.response.ok || purchasesRes.payload.Status !== "200") {
      return NextResponse.json(
        {
          message: "ERP 구매현황 조회 실패",
          detail:
            purchasesRes.payload.Error?.Message ??
            `HTTP ${purchasesRes.response.status} / Status ${purchasesRes.payload.Status ?? "unknown"}`,
        },
        { status: 502 }
      );
    }

    const records = extractRecords(purchasesRes.payload.Data);
    if (records.length === 0) {
      return NextResponse.json({
        inserted: 0,
        totalFetched: 0,
        fromDate,
        toDate,
        message: "조회된 구매현황이 없습니다.",
      });
    }

    const erpCodes = Array.from(
      new Set(
        records
          .map((row) => pickString(row, ["PROD_CD", "ERP_CODE", "ITEM_CD"]))
          .filter((code): code is string => Boolean(code))
      )
    );

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const erpSystem = erpMappingSystemCode(companyCode);
    let productIdByCode: Record<string, string> = {};
    if (erpCodes.length > 0) {
      const { data: mappings, error: mappingError } = await supabaseAdmin
        .from("item_erp_mapping")
        .select("product_id, erp_code")
        .eq("erp_system", erpSystem)
        .in("erp_code", erpCodes);
      if (mappingError) {
        return NextResponse.json(
          { message: "item_erp_mapping 조회 실패", detail: mappingError.message },
          { status: 500 }
        );
      }
      productIdByCode = ((mappings as ItemErpMappingRow[] | null) ?? []).reduce<
        Record<string, string>
      >((acc, row) => {
        if (row.erp_code) {
          acc[row.erp_code] = row.product_id;
        }
        return acc;
      }, {});
    }

    const normalized: PurchaseRow[] = records
      .map((row) => {
        const erpCode = pickString(row, ["PROD_CD", "ERP_CODE", "ITEM_CD"]);
        const purchaseDate = pickDate(row, ["IO_DATE", "PURCHASE_DATE", "DATE", "SLIP_DATE"]);
        if (!purchaseDate) {
          return null;
        }
        return {
          product_id: erpCode ? (productIdByCode[erpCode] ?? null) : null,
          erp_code: erpCode,
          erp_product_name: pickString(row, ["PROD_DES", "ERP_PRODUCT_NAME", "ITEM_NM"]),
          supplier_name: pickString(row, ["CUST_DES", "SUPPLIER_NAME", "VENDOR_NAME"]),
          purchase_date: purchaseDate,
          erp_date: pickDate(row, ["ERP_DATE", "REG_DATE"]),
          quantity: pickNumber(row, ["QTY", "QUANTITY", "PUR_QTY"]),
          unit_price: pickNumber(row, ["PRICE", "UNIT_PRICE", "PUR_PRICE"]),
          amount: pickNumber(row, ["AMT", "AMOUNT", "SUPPLY_AMT"]),
          erp_ref: pickString(row, ["SLIP_NO", "DOC_NO", "NO"]),
          source: composeOrderSource(companyCode, "erp_api"),
        };
      })
      .filter((row): row is PurchaseRow => Boolean(row));

    const deduped = Array.from(
      new Map(
        normalized.map((row) => [
          `${row.erp_ref ?? ""}|${row.erp_code ?? ""}|${row.purchase_date}|${row.quantity ?? ""}`,
          row,
        ])
      ).values()
    );

    const { error: insertError } = await supabaseAdmin.from("erp_purchases").insert(deduped);
    if (insertError) {
      return NextResponse.json(
        { message: "erp_purchases 적재 실패", detail: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      inserted: deduped.length,
      totalFetched: records.length,
      fromDate,
      toDate,
      message: "ERP 구매현황 동기화 완료",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    return NextResponse.json(
      {
        message: "ERP 구매현황 동기화 중 네트워크 또는 응답 파싱 오류가 발생했습니다.",
        detail: message,
      },
      { status: 502 }
    );
  }
}
