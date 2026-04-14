import { NextResponse } from "next/server";

// 변경 이유: 환율 API 키를 클라이언트에 노출하지 않고 서버에서 안전하게 조회하기 위해 추가했습니다.
interface ExchangeRateApiResponse {
  result: string;
  conversion_rates?: Record<string, number>;
  "error-type"?: string;
}

export async function GET(request: Request) {
  const apiKey = process.env.EXCHANGE_RATE_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { message: "EXCHANGE_RATE_KEY가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const base = searchParams.get("base") ?? "CNY";
  const target = searchParams.get("target") ?? "KRW";

  const ALLOWED_BASES = ["CNY", "USD", "JPY", "EUR"];
  if (!ALLOWED_BASES.includes(base)) {
    return NextResponse.json({ message: "지원하지 않는 통화입니다." }, { status: 400 });
  }

  try {
    const response = await fetch(`https://v6.exchangerate-api.com/v6/${apiKey}/latest/${base}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { message: `환율 API 응답 실패 (${response.status})` },
        { status: 502 }
      );
    }

    const payload = (await response.json()) as ExchangeRateApiResponse;
    if (payload.result !== "success" || !payload.conversion_rates) {
      return NextResponse.json(
        {
          message: "환율 API 데이터 형식 오류",
          detail: payload["error-type"] ?? "unknown",
        },
        { status: 502 }
      );
    }

    const rate = payload.conversion_rates[target];
    if (typeof rate !== "number" || !Number.isFinite(rate)) {
      return NextResponse.json({ message: `${target} 환율을 찾을 수 없습니다.` }, { status: 404 });
    }

    return NextResponse.json({
      base,
      target,
      rate,
      fetchedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { message: "환율 API 호출 중 네트워크 오류가 발생했습니다." },
      { status: 502 }
    );
  }
}
