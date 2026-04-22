import { NextResponse } from "next/server";

/** exchangerate-api.com v6 pair 응답 최소 형태 */
interface PairApiBody {
  result?: string;
  conversion_rate?: number;
  "error-type"?: string;
}

/**
 * 통화→KRW 환율 조회 (서버만 EXCHANGE_RATE_KEY 사용)
 * GET ?from=USD&to=KRW — to 생략 시 KRW
 */
export async function GET(request: Request) {
  const key = process.env.EXCHANGE_RATE_KEY?.trim();
  if (!key) {
    return NextResponse.json({ error: "EXCHANGE_RATE_KEY 미설정", rate: null }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const from = (searchParams.get("from") ?? "USD").trim().toUpperCase();
  const to = (searchParams.get("to") ?? "KRW").trim().toUpperCase();

  if (from === to) {
    return NextResponse.json({ rate: 1, from, to, updatedAt: null });
  }

  const url = `https://v6.exchangerate-api.com/v6/${key}/pair/${from}/${to}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    const body = (await res.json()) as PairApiBody;

    if (!res.ok || body.result !== "success" || typeof body.conversion_rate !== "number") {
      const hint = body["error-type"] ?? body.result ?? `HTTP ${res.status}`;
      return NextResponse.json({ error: `환율 API 오류: ${hint}`, rate: null }, { status: 502 });
    }

    return NextResponse.json({
      rate: body.conversion_rate,
      from,
      to,
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "네트워크 오류";
    return NextResponse.json({ error: msg, rate: null }, { status: 502 });
  }
}
