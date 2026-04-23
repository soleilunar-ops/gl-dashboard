import type { Context } from "hono";
import { crawlSingleItem, resolveSystemForCode, type ErpSystem, SYSTEMS } from "../lib/crawlEngine";

/**
 * POST /crawl/one
 * body: { erp_code: string, erp_system?: "gl"|"glpharm"|"hnb"|"auto", date_from?: string, date_to?: string }
 */
export async function crawlOneHandler(c: Context) {
  let body: {
    erp_code?: string;
    erp_system?: string;
    date_from?: string;
    date_to?: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "JSON body 필요" }, 400);
  }

  const erpCode = body.erp_code?.trim();
  if (!erpCode) return c.json({ error: "erp_code 누락" }, 400);

  let system: ErpSystem;
  const rawSystem = body.erp_system?.trim() ?? "auto";
  if (rawSystem === "auto" || rawSystem === "") {
    try {
      system = await resolveSystemForCode(erpCode);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 404);
    }
  } else if (SYSTEMS.includes(rawSystem as ErpSystem)) {
    system = rawSystem as ErpSystem;
  } else {
    return c.json({ error: `erp_system 값 올바르지 않음: ${rawSystem}` }, 400);
  }

  try {
    const result = await crawlSingleItem({
      system,
      erpCode,
      dateFrom: body.date_from,
      dateTo: body.date_to,
    });
    return c.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ ok: false, error: msg }, 500);
  }
}
