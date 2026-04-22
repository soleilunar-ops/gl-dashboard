from __future__ import annotations

from dataclasses import dataclass

from ecount_crawler import EcountMenu


@dataclass(frozen=True)
class CrawlStep:
    """단계별 메뉴 실행 설정."""

    menu: EcountMenu
    page_type: str
    label: str


def build_production_receipt_step() -> CrawlStep:
    """
    생산입고조회 단계.
    변경 이유: URL 진입 후 엑셀만 다운로드하는 단계 파일로 분리합니다.
    """
    return CrawlStep(
        menu=EcountMenu.생산입고조회,
        page_type="excel_only",
        label="생산입고조회",
    )

