from __future__ import annotations

from dataclasses import dataclass

from ecount_hnb_runtime_core import HnbEcountCrawler


@dataclass(frozen=True)
class HnbPurchaseCrawler:
    """hnb 구매현황 전용 크롤러."""

    async def run(
        self,
        date_from: str,
        date_to: str,
        save_to_db: bool,
        retry_per_menu: int,
    ) -> dict[str, object]:
        """
        변경 이유: hnb 구매현황 크롤링 단계를 파일 단위로 분리해 재사용성을 높입니다.
        """
        crawler = HnbEcountCrawler()
        return await crawler.crawl_purchase(
            date_from=date_from,
            date_to=date_to,
            save_to_db=save_to_db,
            retry_per_menu=retry_per_menu,
        )
