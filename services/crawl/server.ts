/**
 * GL 하루온 Ecount 크롤 서비스 (Railway 전용)
 *
 * 엔드포인트
 *  - GET  /health           → 상태 확인 (시크릿 없이 호출 가능)
 *  - POST /crawl/one        → 단일 품목 (X-Crawl-Secret 필요)
 *  - POST /crawl/all        → 전체 배치 (X-Crawl-Secret 필요, 30~60분 소요)
 *
 * 필수 env (Railway Variables)
 *  - NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *  - ECOUNT_GL_COM_CODE / USER_ID / USER_PW
 *  - ECOUNT_GLPHARM_COM_CODE / USER_ID / USER_PW
 *  - ECOUNT_HNB_COM_CODE / USER_ID / USER_PW
 *  - CRAWL_SERVICE_SECRET   (대시보드 → 이 서비스 호출 시 헤더)
 *  - PORT                   (Railway가 자동 주입)
 */

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { requireCrawlSecret } from "./middleware/auth";
import { crawlOneHandler } from "./routes/crawlOne";
import { crawlAllHandler } from "./routes/crawlAll";

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok", service: "gl-crawl-service" }));

app.use("/crawl/*", requireCrawlSecret);
app.post("/crawl/one", crawlOneHandler);
app.post("/crawl/all", crawlAllHandler);

const port = Number(process.env.PORT || 8080);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[crawl-service] listening on :${info.port}`);
});
