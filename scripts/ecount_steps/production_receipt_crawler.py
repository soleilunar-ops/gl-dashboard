from __future__ import annotations

from dataclasses import dataclass

from ecount_runtime_core import EcountCrawler, EcountMenu


@dataclass(frozen=True)
class ProductionReceiptCrawler:
    """생산입고조회 전용 크롤러."""

    company_code: str

    async def run(
        self,
        date_from: str,
        date_to: str,
        save_to_db: bool,
        retry_per_menu: int,
    ) -> dict[str, object]:
        """
        생산입고조회 메뉴만 단독 실행.
        변경 이유: 메뉴별 크롤러를 파일 단위로 분리해 파이프라인 결합도를 낮춥니다.
        """
        crawler = EcountCrawler(company_code=self.company_code)
        results = await crawler.crawl_multi_menus_and_save(
            menus=[EcountMenu.생산입고조회],
            date_from=date_from,
            date_to=date_to,
            save_to_db=save_to_db,
            page_types={EcountMenu.생산입고조회.value: "excel_only"},
            retry_per_menu=retry_per_menu,
        )
        if results:
            return results[0]
        return {
            "menu": EcountMenu.생산입고조회.value,
            "rows": [],
            "inserted": 0,
            "error": "생산입고조회 결과가 비어 있습니다.",
            "page_type": "excel_only",
        }
