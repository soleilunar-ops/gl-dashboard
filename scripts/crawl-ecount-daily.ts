/**
 * Ecount 재고수불부 일일 배치 크롤 — CLI 래퍼
 *
 * 실제 로직은 services/crawl/lib/crawlEngine.ts 에 있고,
 * 이 파일은 GitHub Actions / 로컬 CLI 실행용 얇은 진입점.
 *
 * 실행: npm run crawl:ecount
 *   - GitHub Actions: .github/workflows/ecount-daily-crawl.yml 에서 호출
 *   - 로컬: .env 에 환경변수 셋팅 후 실행
 *
 * Railway 크롤 서비스 (services/crawl/server.ts) 와 동일한 엔진을 공유.
 */

import { crawlAllSystems } from "../services/crawl/lib/crawlEngine";

async function main() {
  const summary = await crawlAllSystems({});

  if (summary.ok === 0) {
    console.error("[ecount-daily] 성공 건수 0 — CI 실패 처리");
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("[ecount-daily] 치명적 오류:", e);
  process.exit(2);
});
