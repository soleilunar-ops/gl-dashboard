from __future__ import annotations

import argparse
import asyncio
from datetime import datetime
from typing import Protocol

from ecount_runtime_core import normalize_company_code
from ecount_steps.production_receipt_crawler import ProductionReceiptCrawler
from ecount_steps.purchase_crawler import PurchaseCrawler
from ecount_steps.sales_crawler import SalesCrawler


class StepRunner(Protocol):
    async def run(
        self,
        date_from: str,
        date_to: str,
        save_to_db: bool,
        retry_per_menu: int,
    ) -> dict[str, object]: ...


def _build_default_steps(company_code: str) -> list[tuple[str, StepRunner]]:
    """
    기본 파이프라인 단계.
    순서: 생산입고조회 -> 구매현황 -> 판매현황
    """
    production = ProductionReceiptCrawler(company_code=company_code)
    purchase = PurchaseCrawler(company_code=company_code)
    sales = SalesCrawler(company_code=company_code)
    return [
        ("생산입고조회", production),
        ("구매현황", purchase),
        ("판매현황", sales),
    ]


async def run_pipeline(
    company_code: str,
    date_from: str,
    date_to: str,
    save_to_db: bool,
    retry_per_menu: int,
) -> list[dict[str, object]]:
    """
    멀티 파이프라인 실행.
    변경 이유: 메뉴별 별도 크롤러 모듈을 순차 실행하도록 구조를 분리합니다.
    """
    steps = _build_default_steps(company_code=company_code)
    results: list[dict[str, object]] = []

    print("\n" + "=" * 60)
    print("[EcountPipeline] 실행 순서")
    for idx, (label, _runner) in enumerate(steps, start=1):
        print(f"  {idx}. {label}")
    print("=" * 60)

    for label, runner in steps:
        print(f"\n[EcountPipeline] 단계 시작: {label}")
        step_result = await runner.run(
            date_from=date_from,
            date_to=date_to,
            save_to_db=save_to_db,
            retry_per_menu=retry_per_menu,
        )
        results.append(step_result)
        print(
            f"[EcountPipeline] 단계 완료: {label} | "
            f"rows={len(step_result.get('rows', []))} | "
            f"inserted={step_result.get('inserted')} | "
            f"error={step_result.get('error')}"
        )

    return results


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Ecount 멀티 파이프라인 (생산입고조회 -> 구매현황 -> 판매현황)"
    )
    parser.add_argument("--company", default="gl", help="기업 코드 (기본: gl)")
    parser.add_argument("--from", dest="date_from", default="2024-01-01")
    parser.add_argument(
        "--to",
        dest="date_to",
        default=datetime.now().strftime("%Y-%m-%d"),
    )
    parser.add_argument("--no-db", action="store_true", help="DB 저장 스킵")
    parser.add_argument(
        "--retry-per-menu",
        type=int,
        default=2,
        help="메뉴별 재시도 횟수 (기본: 2)",
    )
    return parser.parse_args()


async def _main() -> None:
    args = _parse_args()
    company_code = normalize_company_code(args.company)
    results = await run_pipeline(
        company_code=company_code,
        date_from=args.date_from,
        date_to=args.date_to,
        save_to_db=not args.no_db,
        retry_per_menu=max(0, int(args.retry_per_menu)),
    )

    print("\n" + "#" * 60)
    print("[EcountPipeline] 결과 요약")
    print("#" * 60)
    for row in results:
        print(
            f"  {row.get('menu')} | rows={len(row.get('rows', []))} | "
            f"inserted={row.get('inserted')} | error={row.get('error')}"
        )


if __name__ == "__main__":
    asyncio.run(_main())

