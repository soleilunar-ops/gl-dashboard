"""
GL-RADS | ecount_* 테이블 저장 현황 상비용 점검 스크립트 (v2)

사용법:
    python scripts/check_ecount.py               # 3사 × 5테이블 매트릭스 전체
    python scripts/check_ecount.py --company gl  # 지엘만
    python scripts/check_ecount.py --menu purchase

v2: 생산 테이블 2개 분리 반영
    - ecount_production_outsource (E040410 외주, doc_date 기반)
    - ecount_production_receipt   (E040305 입고, date_from/date_to 기반)
"""
from __future__ import annotations

import os
import sys
import argparse

try:
    from dotenv import load_dotenv
    _ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    load_dotenv(os.path.join(_ROOT, ".env.local"))
except Exception:
    pass

from supabase import create_client  # noqa: E402

URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

if not URL or not KEY:
    print("❌ SUPABASE_URL / KEY 미설정")
    sys.exit(1)

# (table_name, date_col, erp_col_exists)
TABLES: dict[str, tuple[str, str, bool]] = {
    "purchase": ("ecount_purchase", "doc_date", True),
    "sales": ("ecount_sales", "doc_date", True),
    "stock_ledger": ("ecount_stock_ledger", "doc_date", False),
    "production_outsource": ("ecount_production_outsource", "doc_date", True),
    "production_receipt": ("ecount_production_receipt", "date_from", False),
}

COMPANIES = ["gl", "gl_pharm", "hnb"]


def inspect(s, table: str, company: str, date_col: str, has_erp: bool) -> None:
    try:
        c = s.table(table).select("id", count="exact").eq(
            "company_code", company
        ).execute()
        cnt = c.count or 0

        if cnt == 0:
            print(f"  {company:>10} | {table:<30} | (비어있음)")
            return

        sel = date_col + (",erp_code" if has_erp else "")
        r = s.table(table).select(sel).eq(
            "company_code", company
        ).execute()
        rows = r.data or []
        dates = [x[date_col] for x in rows if x.get(date_col)]
        uniq = (
            len({x["erp_code"] for x in rows if x.get("erp_code")})
            if has_erp else "-"
        )
        if dates:
            print(
                f"  {company:>10} | {table:<30} | "
                f"rows={cnt:>5} | {min(dates)} ~ {max(dates)} | uniq_erp={uniq}"
            )
        else:
            print(
                f"  {company:>10} | {table:<30} | "
                f"rows={cnt:>5} | (날짜 없음) | uniq_erp={uniq}"
            )
    except Exception as e:
        err_msg = str(e)[:80]
        print(f"  {company:>10} | {table:<30} | ❌ {err_msg}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--company", default="all", choices=COMPANIES + ["all"])
    ap.add_argument(
        "--menu",
        default="all",
        choices=list(TABLES.keys()) + ["all"],
    )
    args = ap.parse_args()

    s = create_client(URL, KEY)
    companies = COMPANIES if args.company == "all" else [args.company]
    menus = list(TABLES.keys()) if args.menu == "all" else [args.menu]

    print("=" * 90)
    print("[check_ecount] Supabase ecount_* 적재 현황")
    print("=" * 90)
    for menu in menus:
        table, date_col, has_erp = TABLES[menu]
        for co in companies:
            inspect(s, table, co, date_col, has_erp)
    print("=" * 90)


if __name__ == "__main__":
    main()
