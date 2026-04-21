"""
hnb 전용 Ecount 런타임 코어.
변경 이유: hnb 판매현황/구매현황 실행 진입을 공통 런타임과 분리해 운영 실수를 줄입니다.
"""

from __future__ import annotations

from datetime import datetime

from ecount_runtime_core import EcountCrawler, EcountMenu

HNB_COMPANY_CODE = "hnb"


class HnbEcountCrawler:
    """hnb 기업 코드로만 동작하는 얇은 래퍼."""

    def __init__(self) -> None:
        self._crawler = EcountCrawler(company_code=HNB_COMPANY_CODE)

    async def crawl_purchase(
        self,
        date_from: str,
        date_to: str,
        save_to_db: bool,
        retry_per_menu: int = 2,
    ) -> dict[str, object]:
        """
        변경 이유: hnb 구매현황 실행 시 page_type과 메뉴를 고정해 호출 실수를 방지합니다.
        """
        results = await self._crawler.crawl_multi_menus_and_save(
            menus=[EcountMenu.구매현황],
            date_from=date_from,
            date_to=date_to,
            save_to_db=save_to_db,
            page_types={EcountMenu.구매현황.value: "search_excel"},
            retry_per_menu=retry_per_menu,
        )
        if results:
            return results[0]
        return {
            "menu": EcountMenu.구매현황.value,
            "rows": [],
            "inserted": 0,
            "error": "hnb 구매현황 결과가 비어 있습니다.",
            "page_type": "search_excel",
        }

    async def crawl_sales(
        self,
        date_from: str,
        date_to: str,
        save_to_db: bool,
        retry_per_menu: int = 2,
    ) -> dict[str, object]:
        """
        변경 이유: hnb 판매현황 실행 시 page_type과 메뉴를 고정해 호출 실수를 방지합니다.
        """
        results = await self._crawler.crawl_multi_menus_and_save(
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
            "error": "hnb 판매현황 결과가 비어 있습니다.",
            "page_type": "search_excel",
        }


def default_date_to() -> str:
    """실행 시점 기준 기본 종료일."""
    return datetime.now().strftime("%Y-%m-%d")
