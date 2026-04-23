import type { Context, Next } from "hono";

/** X-Crawl-Secret 헤더 검증 — CRAWL_SERVICE_SECRET env 와 일치해야 통과 */
export async function requireCrawlSecret(c: Context, next: Next) {
  const expected = process.env.CRAWL_SERVICE_SECRET;
  if (!expected) {
    return c.json({ error: "서버에 CRAWL_SERVICE_SECRET 미설정" }, 500);
  }
  const got = c.req.header("x-crawl-secret");
  if (got !== expected) {
    return c.json({ error: "unauthorized" }, 401);
  }
  return next();
}
