import type { Context } from "hono";
import { crawlAllSystems } from "../lib/crawlEngine";

/**
 * POST /crawl/all
 * body: { date_from?: string, date_to?: string }
 * 주의: 30~60분 걸릴 수 있음 (synchronous). 클라이언트가 keep-alive 상태여야 함.
 */
export async function crawlAllHandler(c: Context) {
  let body: { date_from?: string; date_to?: string } = {};
  try {
    const raw = await c.req.text();
    if (raw) body = JSON.parse(raw);
  } catch {
    // 빈 바디 허용
  }

  try {
    const summary = await crawlAllSystems({
      dateFrom: body.date_from,
      dateTo: body.date_to,
    });
    return c.json({ ok: true, summary });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ ok: false, error: msg }, 500);
  }
}
