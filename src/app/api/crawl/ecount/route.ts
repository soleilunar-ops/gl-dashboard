import { NextRequest, NextResponse } from "next/server";
import { chromium } from "playwright";

import { loginToEcount } from "@/lib/ecount/ecountAuth";
import { downloadAndParseLedger } from "@/lib/ecount/ecountExcel";
import { openLedgerAndFillFilters } from "@/lib/ecount/ecountNavigation";
import { persistOrdersToSupabase } from "@/lib/ecount/ecountPersist";
import {
  EcountCompanyCodeError,
  EcountExcelError,
  EcountFilterError,
  EcountLoginError,
  EcountMappingError,
} from "@/lib/ecount/types";
import { createClient } from "@/lib/supabase/server";

const CRAWL_DRY_RUN = process.env.CRAWL_DRY_RUN === "true";

export async function POST(req: NextRequest) {
  // 인증 체크 (대시보드 로그인 사용자만 호출 가능 — ERP 자격증명 보호)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  // 환경변수 검증 (모듈 로드 시점이 아닌 요청 시점에 체크)
  const COMPANY = process.env.ECOUNT_COMPANY_CODE;
  const USER_ID = process.env.ECOUNT_USER_ID;
  const PASSWORD = process.env.ECOUNT_PASSWORD;
  if (!COMPANY || !USER_ID || !PASSWORD) {
    return NextResponse.json(
      {
        error: "이카운트 자격증명 환경변수가 설정되지 않았습니다.",
        missing: {
          ECOUNT_COMPANY_CODE: !COMPANY,
          ECOUNT_USER_ID: !USER_ID,
          ECOUNT_PASSWORD: !PASSWORD,
        },
      },
      { status: 500 }
    );
  }

  const { item_code, date_from, date_to } = await req.json();

  if (!item_code) {
    return NextResponse.json({ error: "ERP 코드가 없어 크롤링할 수 없습니다." }, { status: 400 });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  try {
    // 1. 로그인 — 회사코드/로그인 실패는 loginToEcount에서 경로 고유 debug와 함께 throw
    const activePage = await loginToEcount(page, context, {
      company: COMPANY,
      userId: USER_ID,
      password: PASSWORD,
    });

    // 2. 재고수불부 이동 + 필터 입력 + 조회 — 품목코드 실패는 openLedgerAndFillFilters에서 throw
    const { ledgerFrame, ledgerScopes } = await openLedgerAndFillFilters(activePage, {
      itemCode: item_code,
      dateFrom: date_from,
      dateTo: date_to,
    });

    // 3. 엑셀 다운로드 + 파싱 — 엑셀 버튼 미발견은 downloadAndParseLedger에서 throw
    const parsed = await downloadAndParseLedger(activePage, ledgerFrame, ledgerScopes);

    // 4. Supabase 적재 (신 스키마 v6) — 매핑 없음은 EcountMappingError, DB 에러는 generic
    const result = await persistOrdersToSupabase(parsed, item_code, { dryRun: CRAWL_DRY_RUN });

    return NextResponse.json({ success: true, ...result });
  } catch (e: unknown) {
    // 경로별 debug 구조를 그대로 보존 (refactor.md §3.2 DO-2)
    if (e instanceof EcountCompanyCodeError) {
      return NextResponse.json({ error: e.message, debug: e.debug }, { status: 500 });
    }
    if (e instanceof EcountLoginError) {
      return NextResponse.json({ error: e.message, debug: e.debug }, { status: 500 });
    }
    if (e instanceof EcountFilterError) {
      return NextResponse.json({ error: e.message, debug: e.debug }, { status: 500 });
    }
    if (e instanceof EcountExcelError) {
      return NextResponse.json({ error: e.message, debug: e.debug }, { status: 500 });
    }
    if (e instanceof EcountMappingError) {
      return NextResponse.json({ error: e.message, hint: e.hint }, { status: 422 });
    }
    const url = page.url().slice(0, 300);
    const message = e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.";
    return NextResponse.json({ error: `${message} (현재 URL: ${url})` }, { status: 500 });
  } finally {
    await browser.close();
  }
}
