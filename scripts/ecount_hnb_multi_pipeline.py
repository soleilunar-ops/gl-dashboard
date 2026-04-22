from __future__ import annotations

import argparse
import asyncio

from ecount_hnb_runtime_core import default_date_to
from ecount_steps.hnb_purchase_crawler import HnbPurchaseCrawler
from ecount_steps.hnb_sales_crawler import HnbSalesCrawler


async def run_pipeline(
    date_from: str,
    date_to: str,
    save_to_db: bool,
    retry_per_menu: int,
) -> list[dict[str, object]]:
    """
    변경 이유: hnb 판매/구매 전용 멀티 파이프라인 엔트리를 분리해 운영 시 혼선을 줄입니다.
    """
    purchase = HnbPurchaseCrawler()
    sales = HnbSalesCrawler()
    steps: list[tuple[str, object]] = [
        ("구매현황", purchase),
        ("판매현황", sales),
    ]
    results: list[dict[str, object]] = []

    print("\n" + "=" * 60)
    print("[EcountHnbPipeline] 실행 순서")
    for idx, (label, _runner) in enumerate(steps, start=1):
        print(f"  {idx}. {label}")
    print("=" * 60)

    for label, runner in steps:
        print(f"\n[EcountHnbPipeline] 단계 시작: {label}")
        step_result = await runner.run(
            date_from=date_from,
            date_to=date_to,
            save_to_db=save_to_db,
            retry_per_menu=retry_per_menu,
        )
        results.append(step_result)
        print(
            f"[EcountHnbPipeline] 단계 완료: {label} | "
            f"rows={len(step_result.get('rows', []))} | "
            f"inserted={step_result.get('inserted')} | "
            f"error={step_result.get('error')}"
        )
    return results


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="hnb Ecount 멀티 파이프라인 (구매현황 -> 판매현황)")
    parser.add_argument("--from", dest="date_from", default="2024-01-01")
    parser.add_argument("--to", dest="date_to", default=default_date_to())
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
    results = await run_pipeline(
        date_from=args.date_from,
        date_to=args.date_to,
        save_to_db=not args.no_db,
        retry_per_menu=max(0, int(args.retry_per_menu)),
    )

    print("\n" + "#" * 60)
    print("[EcountHnbPipeline] 결과 요약")
    print("#" * 60)
    for row in results:
        print(
            f"  {row.get('menu')} | rows={len(row.get('rows', []))} | "
            f"inserted={row.get('inserted')} | error={row.get('error')}"
        )


if __name__ == "__main__":
    asyncio.run(_main())
