import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * 유니패스: 화물통관진행정보 가이드 (retrieveCargCsclPrgsInfo, mblNo·blYy)
 * 해양수산부: DAT211 외항화물반출입정보 Info4 — XML, 파라미터 prtAgCd·etryptYear·etryptCo·clsgn
 * 호출부호(clsgn) 없으면 2차 조회 생략 → .env PUBLIC_DATA_DEFAULT_CLSGN 또는 ?clsgn=
 * 항만청코드(prtAgCd) 기본 020(가이드 샘플: 부산), 인천 등은 PUBLIC_DATA_PRT_AG_CD로 변경
 *
 * 보안 메모: 유니패스/공공데이터포털 API는 정책상 serviceKey/crkyCn을 URL 쿼리로만 받음.
 * 헤더 인증 미지원 → URL 노출 위험 인지하되 우회 불가. Vercel/Next.js 기본 설정에선 URL 로그 미수집.
 */
/** DAT211: 외항화물반출입정보 Info4 (XML). env로 전체 URL 교체 가능 */
const DEFAULT_CARG_FRGHT_OUT_URL = "https://apis.data.go.kr/1192000/CargFrghtOut4/Info4";
const EXTERNAL_API_TIMEOUT_MS = 15000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const controller = new AbortController();
  const timeoutMs = init.timeoutMs ?? EXTERNAL_API_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function dedupeYears(years: number[]): string[] {
  const unique = Array.from(new Set(years.filter((y) => Number.isFinite(y))));
  return unique.map((y) => String(y));
}

/**
 * BL만으로 유니패스 blYy 후보를 생성한다.
 * - 4자리 연도(20xx) 패턴 우선
 * - 2자리 연도(YY)는 20YY로 변환
 * - 없으면 현재연도 기준 근접 연도 재시도
 */
function extractCandidateYears(bl: string, currentYear: number): string[] {
  const normalized = bl.trim().toUpperCase();
  const years: number[] = [currentYear, currentYear - 1, currentYear + 1];

  const fullYearMatches = normalized.match(/20\d{2}/g) ?? [];
  for (const token of fullYearMatches) {
    const y = Number.parseInt(token, 10);
    if (y >= 2000 && y <= 2099) years.unshift(y);
  }

  const shortYearMatches = normalized.match(/\d{2}/g) ?? [];
  for (const yy of shortYearMatches) {
    const y = 2000 + Number.parseInt(yy, 10);
    if (y >= 2000 && y <= 2099) years.push(y);
  }

  return dedupeYears(years);
}

function firstXmlTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`);
  const m = xml.match(re);
  const v = m?.[1]?.trim();
  return v && v.length > 0 ? v : null;
}

/** 유니패스 total count */
function parseUnipassCount(xml: string): number {
  const raw = firstXmlTag(xml, "tCnt");
  if (!raw) return 0;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** ISO-like datetime → YYYY-MM-DD */
function toYmd(isoOrDate: string | null): string | null {
  if (!isoOrDate) return null;
  const s = isoOrDate.trim();
  const d = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (d?.[1]) return d[1];
  const compact = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (compact) {
    return `${compact[1]}-${compact[2]}-${compact[3]}`;
  }
  return null;
}

/** 유니패스 오류: 가이드상 tCnt가 -1이면 실패, ntceInfo의 [N00]은 다건 안내(오류 아님) */
function isUnipassError(xml: string): boolean {
  return /<tCnt>\s*-1\s*<\/tCnt>/.test(xml);
}

/** 유니패스 응답에서 선박명 (가이드: shipNm). 다건([N00]) 시 첫 cargCsclPrgsInfoQryVo에서 추출 */
function parseUnipassShipName(xml: string): string | null {
  const direct = firstXmlTag(xml, "shipNm") ?? firstXmlTag(xml, "vslNm");
  if (direct) return direct;
  const vo = xml.match(/<cargCsclPrgsInfoQryVo>([\s\S]*?)<\/cargCsclPrgsInfoQryVo>/)?.[1];
  if (vo) {
    return firstXmlTag(vo, "shipNm") ?? firstXmlTag(vo, "vslNm");
  }
  return null;
}

/** 유니패스 통관 진행상태 (가이드: csclPrgsStts 등) */
function parseUnipassTrackingStatus(xml: string): string | null {
  const direct =
    firstXmlTag(xml, "csclPrgsStts") ??
    firstXmlTag(xml, "prgsStts") ??
    firstXmlTag(xml, "cargCsclPrgsStts");
  if (direct) return direct;
  const vo = xml.match(/<cargCsclPrgsInfoQryVo>([\s\S]*?)<\/cargCsclPrgsInfoQryVo>/)?.[1];
  if (vo) {
    return (
      firstXmlTag(vo, "csclPrgsStts") ??
      firstXmlTag(vo, "prgsStts") ??
      firstXmlTag(vo, "cargCsclPrgsStts")
    );
  }
  return null;
}

/** 호출부호 후보 (외항 API 필수 파라미터 clsgn) */
function parseCallSignFromUnipass(xml: string): string | null {
  const tags = ["calfSgn", "callSgn", "clsgn", "statsSgn"];
  for (const t of tags) {
    const v = firstXmlTag(xml, t);
    if (v) return v;
  }
  return null;
}

/** 유니패스 출항일(etprDt) */
function parseUnipassDepartureDate(xml: string): string | null {
  const direct = toYmd(firstXmlTag(xml, "etprDt"));
  if (direct) return direct;
  const vo = xml.match(/<cargCsclPrgsInfoQryVo>([\s\S]*?)<\/cargCsclPrgsInfoQryVo>/)?.[1];
  if (!vo) return null;
  return toYmd(firstXmlTag(vo, "etprDt"));
}

type UnipassDetailEvent = {
  processAt: string | null;
  processText: string;
  relationText: string;
};

function parseUnipassDetailEvents(xml: string): UnipassDetailEvent[] {
  const blocks = xml.match(/<cargCsclPrgsInfoDtlQryVo>[\s\S]*?<\/cargCsclPrgsInfoDtlQryVo>/g) ?? [];
  return blocks.map((block) => ({
    processAt: toYmd(firstXmlTag(block, "prcsDttm") ?? firstXmlTag(block, "rlbrDttm")),
    processText: firstXmlTag(block, "rlbrCn") ?? "",
    relationText: firstXmlTag(block, "cargTrcnRelaBsopTpcd") ?? "",
  }));
}

/** 유니패스 상세 이력에서 입항/하선 시점 추정 */
function parseUnipassActualArrivalDate(xml: string): string | null {
  const events = parseUnipassDetailEvents(xml).filter((e) => e.processAt);
  if (events.length === 0) return null;

  const arrivalKeywords = /(입항|하선|반입|도착|양하)/;
  const priority = events.find((e) => arrivalKeywords.test(`${e.processText} ${e.relationText}`));
  if (priority?.processAt) return priority.processAt;

  // 키워드가 없으면 가장 이른 처리일을 입항일 후보로 사용
  const sorted = [...events].sort((a, b) => (a.processAt ?? "").localeCompare(b.processAt ?? ""));
  return sorted[0]?.processAt ?? null;
}

/** 유니패스 상세 이력에서 반출신고 처리일(창고 입고 실제일 후보) 추정 */
function parseUnipassWarehouseInDate(xml: string): string | null {
  const events = parseUnipassDetailEvents(xml).filter((e) => e.processAt);
  if (events.length === 0) return null;
  const warehouseKeywords = /(반출신고|수입신고수리|반출)/;
  const priority = events.find((e) => warehouseKeywords.test(`${e.processText} ${e.relationText}`));
  if (priority?.processAt) return priority.processAt;
  return null;
}

/** 외항 XML에서 BL과 일치하는 item 우선, 없으면 첫 item */
function parseMaritimeItemXml(xml: string, mblNo: string) {
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  if (blocks.length === 0) return { eta: null, actualArrival: null };
  const normalize = (s: string) => s.replace(/\s/g, "").toUpperCase();
  const target = normalize(mblNo);

  const pick = (block: string) => {
    const blRaw = firstXmlTag(block, "blNo");
    const bl = blRaw ? normalize(blRaw) : "";
    const aprtf = firstXmlTag(block, "aprtfEtryptDt");
    const etrynd = firstXmlTag(block, "etryndDt");
    return { blMatch: bl && bl === target, aprtf, etrynd };
  };

  let best = blocks[0] ? pick(blocks[0]) : { blMatch: false, aprtf: null, etrynd: null };
  for (const block of blocks) {
    const p = pick(block);
    if (p.blMatch) {
      best = p;
      break;
    }
  }
  return {
    eta: toYmd(best.aprtf),
    actualArrival: toYmd(best.etrynd),
  };
}

export async function GET(req: NextRequest) {
  // 인증 체크 (대시보드 로그인 사용자만 호출 가능)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const bl = req.nextUrl.searchParams.get("bl");
  const yearParam = req.nextUrl.searchParams.get("year");
  const currentYear = new Date().getFullYear();
  const yearCandidates = yearParam
    ? [yearParam]
    : bl
      ? extractCandidateYears(bl, currentYear)
      : [String(currentYear)];

  const clsgnParam = req.nextUrl.searchParams.get("clsgn");
  const prtAgCd =
    req.nextUrl.searchParams.get("prtAgCd") ?? process.env.PUBLIC_DATA_PRT_AG_CD ?? "020";
  const etryptCo =
    req.nextUrl.searchParams.get("etryptCo") ?? process.env.PUBLIC_DATA_ETRYPT_CO ?? "001";

  if (!bl) return NextResponse.json({ error: "BL번호 없음" }, { status: 400 });

  if (!process.env.UNIPASS_API_KEY) {
    return NextResponse.json({ error: "UNIPASS_API_KEY가 설정되지 않았습니다." }, { status: 500 });
  }

  try {
    // 1. 유니패스 화물통관 진행정보 (가이드: mblNo, blYy)
    let unipassXml = "";
    let selectedYear = yearCandidates[0] ?? String(currentYear);
    let selectedBlType: "mblNo" | "hblNo" = "mblNo";
    let lastErrorMessage: string | null = null;
    let hasZeroCountOnly = false;

    for (const candidateYear of yearCandidates) {
      for (const blType of ["mblNo", "hblNo"] as const) {
        const unipassRes = await fetchWithTimeout(
          `https://unipass.customs.go.kr:38010/ext/rest/cargCsclPrgsInfoQry/retrieveCargCsclPrgsInfo?crkyCn=${encodeURIComponent(process.env.UNIPASS_API_KEY)}&${blType}=${encodeURIComponent(bl)}&blYy=${encodeURIComponent(candidateYear)}`,
          { cache: "no-store" }
        );
        const xml = await unipassRes.text();

        if (isUnipassError(xml)) {
          lastErrorMessage = firstXmlTag(xml, "ntceInfo") ?? "유니패스 조회 실패";
          continue;
        }

        const tCnt = parseUnipassCount(xml);
        if (tCnt <= 0) {
          hasZeroCountOnly = true;
          continue;
        }

        const shipName = parseUnipassShipName(xml);
        const status = parseUnipassTrackingStatus(xml);
        const callSign = parseCallSignFromUnipass(xml);

        unipassXml = xml;
        selectedYear = candidateYear;
        selectedBlType = blType;
        if (shipName || status || callSign || tCnt > 0) {
          break;
        }
      }
      if (unipassXml) {
        break;
      }
    }

    if (!unipassXml) {
      return NextResponse.json(
        {
          error:
            lastErrorMessage ??
            (hasZeroCountOnly
              ? "유니패스 조회 결과가 없습니다. MBL/HBL 번호 또는 연도를 확인해 주세요."
              : "유니패스 조회 실패"),
          vesselName: "",
          eta: null,
          actualArrival: null,
          trackingStatus: "",
        },
        { status: 502 }
      );
    }

    const vesselName = parseUnipassShipName(unipassXml);
    const trackingStatus = parseUnipassTrackingStatus(unipassXml) ?? "";
    const departureDate = parseUnipassDepartureDate(unipassXml);
    const warehouseInDate = parseUnipassWarehouseInDate(unipassXml);
    const clsgn =
      clsgnParam?.trim() ||
      parseCallSignFromUnipass(unipassXml) ||
      process.env.PUBLIC_DATA_DEFAULT_CLSGN?.trim() ||
      null;

    // 2. 해양수산부 외항화물반출입정보 Info4 — DAT211 (XML, JSON 아님)
    let eta: string | null = null;
    let actualArrival: string | null = parseUnipassActualArrivalDate(unipassXml);

    const publicDataKey = process.env.PUBLIC_DATA_API_KEY;
    const maritimeBase = process.env.PUBLIC_DATA_VESSEL_API_URL ?? DEFAULT_CARG_FRGHT_OUT_URL;

    // 호출부호(clsgn)는 있는데 API 키가 없으면 2차 조회를 못 함 → 운영자가 인지 가능하게 경고
    if (clsgn && !publicDataKey) {
      console.warn(
        "[tracking] PUBLIC_DATA_API_KEY 미설정 → 해양수산부 입항/ETA 2차 조회 생략 (유니패스 1차 결과만 반환)"
      );
    }

    if (clsgn && publicDataKey) {
      const etryptYear = selectedYear.slice(0, 4);
      const q = new URL(maritimeBase);
      q.searchParams.set("serviceKey", publicDataKey);
      q.searchParams.set("pageNo", "1");
      q.searchParams.set("numOfRows", "50");
      q.searchParams.set("prtAgCd", prtAgCd);
      q.searchParams.set("etryptYear", etryptYear);
      q.searchParams.set("etryptCo", etryptCo);
      q.searchParams.set("clsgn", clsgn);

      const maritimeRes = await fetchWithTimeout(q.toString(), { cache: "no-store" });
      const maritimeXml = await maritimeRes.text();

      const resultCode = firstXmlTag(maritimeXml, "resultCode");
      if (resultCode === "00" || resultCode === "0") {
        const parsed = parseMaritimeItemXml(maritimeXml, bl);
        eta = parsed.eta;
        actualArrival = parsed.actualArrival ?? actualArrival;
      }
    }

    return NextResponse.json({
      vesselName: vesselName ?? "",
      eta,
      actualArrival,
      departureDate,
      warehouseInDate,
      trackingStatus,
      blType: selectedBlType,
    });
  } catch (e) {
    const isTimeout =
      e instanceof Error && (e.name === "AbortError" || e.message.includes("aborted"));
    const message = isTimeout
      ? "외부 트래킹 API 응답이 지연되어 시간 초과되었습니다. 잠시 후 다시 시도해 주세요."
      : "API 호출 실패";
    console.error("트래킹 API 오류:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
