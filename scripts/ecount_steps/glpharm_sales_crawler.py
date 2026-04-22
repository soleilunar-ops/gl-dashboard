from __future__ import annotations

from dataclasses import dataclass

from ecount_glpharm_runtime_core import GlpharmEcountCrawler


@dataclass(frozen=True)
class GlpharmSalesCrawler:
    """glpharm 판매현황 전용 크롤러."""

    async def run(
        self,
        date_from: str,
        date_to: str,
        save_to_db: bool,
        retry_per_menu: int,
    ) -> dict[str, object]:
        """
        변경 이유: glpharm 판매현황 크롤링 단계를 파일 단위로 분리해 파이프라인 구성을 명확히 합니다.
        """
        crawler = GlpharmEcountCrawler()
        return await crawler.crawl_sales(
            date_from=date_from,
            date_to=date_to,
            save_to_db=save_to_db,
            retry_per_menu=retry_per_menu,
        )
