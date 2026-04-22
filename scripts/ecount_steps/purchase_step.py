from __future__ import annotations

from dataclasses import dataclass

from ecount_crawler import EcountMenu


@dataclass(frozen=True)
class CrawlStep:
    """단계별 메뉴 실행 설정."""

    menu: EcountMenu
    page_type: str
    label: str


def build_purchase_step() -> CrawlStep:
    """
    구매현황 단계.
    변경 이유: 구매현황은 검색(F8) 후 엑셀을 받는 단계 파일로 분리합니다.
    """
    return CrawlStep(
        menu=EcountMenu.구매현황,
        page_type="search_excel",
        label="구매현황",
    )

