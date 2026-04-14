const ECOUNT_BASE_URL = "https://oapi.ecounterp.com/OAPI/V2";

interface SessionCache {
  sessionId: string;
  expiresAt: number;
}

interface EcountApiResponse<TData> {
  Status: string;
  Error?: {
    Message?: string;
  };
  Data: TData;
}

interface SessionData {
  SESSION_ID: string;
}

interface StockQtyData {
  Data?: Array<Record<string, unknown>>;
  Qty?: number;
  STOCK_QTY?: number;
}

let sessionCache: SessionCache | null = null;
const SESSION_TTL_MS = 60 * 60 * 1000;

function getEnvOrThrow(key: "ERP_COM_CODE" | "ERP_USER_ID" | "ERP_API_KEY" | "ERP_ZONE"): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} 환경 변수가 설정되지 않았습니다.`);
  }
  return value;
}

async function postEcount<TData>(
  endpoint: string,
  body: Record<string, unknown>,
  sessionId?: string
): Promise<TData> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (sessionId) {
    headers.Cookie = `JSESSIONID=${sessionId}`;
  }

  const response = await fetch(`${ECOUNT_BASE_URL}${endpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`ERP API 호출 실패(${endpoint}): ${response.status}`);
  }

  const payload = (await response.json()) as EcountApiResponse<TData>;
  if (payload.Status !== "200" && payload.Status !== "OK") {
    const message = payload.Error?.Message ?? "ERP API 응답 오류";
    throw new Error(`${endpoint} 실패: ${message}`);
  }

  return payload.Data;
}

export async function getSessionId(): Promise<string> {
  if (sessionCache && Date.now() < sessionCache.expiresAt) {
    return sessionCache.sessionId;
  }

  const sessionData = await postEcount<SessionData>("/GetSessionID", {
    COM_CODE: getEnvOrThrow("ERP_COM_CODE"),
    USER_ID: getEnvOrThrow("ERP_USER_ID"),
    API_CERT_KEY: getEnvOrThrow("ERP_API_KEY"),
    LAN_TYPE: "ko-KR",
    ZONE: getEnvOrThrow("ERP_ZONE"),
  });

  if (!sessionData.SESSION_ID) {
    throw new Error("ERP 세션 발급 실패: SESSION_ID가 없습니다.");
  }

  sessionCache = {
    sessionId: sessionData.SESSION_ID,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  return sessionData.SESSION_ID;
}

export async function getErpStockQtyByCode(erpCode: string): Promise<number> {
  const sessionId = await getSessionId();
  const data = await postEcount<StockQtyData>(
    "/STOCK/STOCK_QTY",
    {
      PROD_CD: erpCode,
    },
    sessionId
  );

  if (typeof data.Qty === "number") {
    return data.Qty;
  }
  if (typeof data.STOCK_QTY === "number") {
    return data.STOCK_QTY;
  }
  if (Array.isArray(data.Data) && data.Data.length > 0) {
    const first = data.Data[0];
    const qtyValue = first.Qty ?? first.STOCK_QTY ?? first.qty;
    const qty = Number(qtyValue);
    if (Number.isFinite(qty)) {
      return qty;
    }
  }

  return 0;
}

export async function getErpLedgerByCode(
  erpCode: string,
  dateFrom: string,
  dateTo: string
): Promise<Record<string, unknown>> {
  const sessionId = await getSessionId();
  const data = await postEcount<Record<string, unknown>>(
    "/STOCK/LEDGER",
    {
      PROD_CD: erpCode,
      DATE_FR: dateFrom,
      DATE_TO: dateTo,
    },
    sessionId
  );

  return data;
}
