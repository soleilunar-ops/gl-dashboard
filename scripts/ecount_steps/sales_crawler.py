from __future__ import annotations

from dataclasses import dataclass

from ecount_runtime_core import EcountCrawler, EcountMenu


@dataclass(frozen=True)
class SalesCrawler:
    """판매현황 전용 크롤러."""

    company_code: str

    async def run(
        self,
        date_from: str,
        date_to: str,
        save_to_db: bool,
        retry_per_menu: int,
    ) -> dict[str, object]:
        """
        판매현황 메뉴만 단독 실행.
        변경 이유: 구매현황 다음 단계를 파일 단위로 분리해 순차 파이프라인을 명확히 합니다.
        """
        crawler = EcountCrawler(company_code=self.company_code)
        results = await crawler.crawl_multi_menus_and_save(
            menus=[EcountMenu.판매현황],
            date_from=date_from,
            date_to=date_to,
            save_to_db=save_to_db,
            page_types={EcountMenu.판매현황.value: "search_excel"},
            retry_per_menu=retry_per_menu,
        )
        if results:
            return results[0]
        return {
            "menu": EcountMenu.판매현황.value,
            "rows": [],
            "inserted": 0,
            "error": "판매현황 결과가 비어 있습니다.",
            "page_type": "search_excel",
        }
