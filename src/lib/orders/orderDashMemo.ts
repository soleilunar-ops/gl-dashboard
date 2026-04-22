/** 대시보드에서만 쓰는 실입고/송금액 — orders.memo 끝에 JSON 조각으로 보관 */

export const DASH_MEMO_MARKER = "__DASH_OVR__:";

export interface DashboardMemoOverlay {
  /** 실입고 수량 */
  rq?: number;
  /** 송금액(합계) */
  rm?: number;
  /** 저장 시점 이행률 스냅샷 0~100 (수량·금액 축 중 의미 있는 비율) — 변경 이유: 계약건별 이행률 영속 */
  fp?: number;
  /** 제조일자 — 연(4자리) */
  mfy?: number;
  /** 제조일자 — 월 1~12 */
  mfm?: number;
  /** 제조일자 — 일 */
  mfd?: number;
}

/** memo에서 대시보드 오버레이 추출 */
export function parseDashboardMemo(memo: string | null): DashboardMemoOverlay {
  if (memo === null || memo === undefined || !memo.includes(DASH_MEMO_MARKER)) {
    return {};
  }
  const raw = memo.split(DASH_MEMO_MARKER)[1]?.trim();
  if (!raw) return {};
  try {
    const j = JSON.parse(raw) as unknown;
    if (j === null || typeof j !== "object" || Array.isArray(j)) return {};
    const o = j as Record<string, unknown>;
    const rq = o.rq;
    const rm = o.rm;
    const fp = o.fp;
    const mfy = o.mfy;
    const mfm = o.mfm;
    const mfd = o.mfd;
    return {
      rq: typeof rq === "number" && Number.isFinite(rq) ? rq : undefined,
      rm: typeof rm === "number" && Number.isFinite(rm) ? rm : undefined,
      fp: typeof fp === "number" && Number.isFinite(fp) ? fp : undefined,
      mfy: typeof mfy === "number" && Number.isFinite(mfy) ? mfy : undefined,
      mfm: typeof mfm === "number" && Number.isFinite(mfm) ? mfm : undefined,
      mfd: typeof mfd === "number" && Number.isFinite(mfd) ? mfd : undefined,
    };
  } catch {
    return {};
  }
}

/** 마커 제거한 순수 메모 본문 */
export function stripDashboardMemo(memo: string | null): string {
  if (!memo?.includes(DASH_MEMO_MARKER)) return memo ?? "";
  return memo.split(DASH_MEMO_MARKER)[0].trimEnd();
}

/** 오버레이 병합 후 memo 문자열 생성 */
export function buildMemoWithOverlay(
  baseMemo: string | null,
  overlay: DashboardMemoOverlay
): string {
  const base = stripDashboardMemo(baseMemo).trim();
  const payload = JSON.stringify(overlay);
  const tail = `${DASH_MEMO_MARKER}${payload}`;
  return base.length > 0 ? `${base}\n${tail}` : tail;
}
