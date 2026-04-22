"""
Ecount에서 내보낸 CSV 또는 XLSX를 Supabase에 적재하는 CLI.
변경 이유: 기본은 컷오프 이하 행만 교체(CSV/크롤 구간 분리); --full-file 이면 파일 전체를 넣고 기간 단위로 통째 교체합니다.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

import pandas as pd
from supabase import Client, create_client

from ecount_runtime_company import EcountMenu, SUPABASE_KEY, SUPABASE_URL
from ecount_runtime_core import CSV_CUTOFF_DATE, _resolve_table_name

_DEFAULT_CUTOFF = CSV_CUTOFF_DATE
from ecount_steps.production_receipt_core import (
    normalize_production_receipt_csv_dataframe,
    normalize_production_receipt_xlsx,
)
from ecount_steps.purchase_core import normalize_purchase_csv_dataframe, normalize_purchase_excel_xlsx
from ecount_steps.sales_core import normalize_sales_csv_dataframe, normalize_sales_excel_xlsx


def _read_csv_with_encoding(path: Path) -> pd.DataFrame:
    """UTF-8-sig / UTF-8 / CP949 순으로 시도합니다."""
    for enc in ("utf-8-sig", "utf-8", "cp949"):
        try:
            return pd.read_csv(path, encoding=enc)
        except UnicodeDecodeError:
            continue
    raise UnicodeDecodeError("csv", b"", 0, 1, "지원 인코딩(utf-8-sig/utf-8/cp949)으로 읽을 수 없습니다.")


def _menu_from_arg(s: str) -> EcountMenu:
    key = s.strip().lower().replace("-", "_")
    mapping: dict[str, EcountMenu] = {
        "purchase": EcountMenu.구매현황,
        "sales": EcountMenu.판매현황,
        "production_receipt": EcountMenu.생산입고조회,
        "production": EcountMenu.생산입고조회,
    }
    if key not in mapping:
        raise SystemExit(f"알 수 없는 --menu: {s} (purchase|sales|production_receipt)")
    return mapping[key]


def _normalize_csv(
    menu: EcountMenu,
    df: pd.DataFrame,
    company_code: str,
    date_from: str,
    date_to: str,
) -> list[dict[str, object]]:
    if menu == EcountMenu.구매현황:
        return normalize_purchase_csv_dataframe(df, company_code, date_from, date_to)
    if menu == EcountMenu.판매현황:
        return normalize_sales_csv_dataframe(df, company_code, date_from, date_to)
    return normalize_production_receipt_csv_dataframe(df, company_code, date_from, date_to)


def _records_from_xlsx_bytes(
    menu: EcountMenu,
    raw: bytes,
    company_code: str,
    date_from: str,
    date_to: str,
) -> list[dict[str, object]]:
    """변경 이유: 크롤러와 동일한 XLSX 정규화 경로를 로컬 파일에도 씁니다."""
    if menu == EcountMenu.구매현황:
        return normalize_purchase_excel_xlsx(raw, company_code, date_from, date_to)
    if menu == EcountMenu.판매현황:
        return normalize_sales_excel_xlsx(raw, company_code, date_from, date_to)
    return normalize_production_receipt_xlsx(raw, company_code, date_from, date_to)


def _records_from_path(
    path: Path,
    menu: EcountMenu,
    company_code: str,
    date_from: str,
    date_to: str,
) -> list[dict[str, object]]:
    suffix = path.suffix.lower()
    if suffix == ".csv":
        df = _read_csv_with_encoding(path)
        return _normalize_csv(menu, df, company_code, date_from, date_to)
    if suffix == ".xlsx":
        return _records_from_xlsx_bytes(menu, path.read_bytes(), company_code, date_from, date_to)
    raise SystemExit(f"[ERROR] 지원 형식: .csv, .xlsx 입니다. (현재 확장자: {suffix or '(없음)'})")


def _filter_doc_date_lte_cutoff(
    records: list[dict[str, object]],
    cutoff: str,
) -> tuple[list[dict[str, object]], int]:
    """CSV 구간(일자 <= 컷오프)만 남깁니다. 크롤링 구간(doc_date > cutoff) 행은 제외합니다."""
    kept: list[dict[str, object]] = []
    dropped_after = 0
    for row in records:
        doc_date = str(row.get("doc_date") or "").strip()
        if not doc_date:
            continue
        if doc_date > cutoff:
            dropped_after += 1
            continue
        kept.append(row)
    return kept, dropped_after


def _patch_rows_period_from_doc_dates(
    records: list[dict[str, object]],
) -> tuple[list[dict[str, object]], str, str]:
    """
    변경 이유: --from/--to 없이 적재할 때, 파일 내 doc_date 최소·최대로 행 메타·삭제 기준을 맞춥니다.
    """
    dates = sorted(
        {
            str(r.get("doc_date") or "").strip()
            for r in records
            if str(r.get("doc_date") or "").strip()
        }
    )
    if not dates:
        raise SystemExit(
            "[ERROR] doc_date가 있는 행이 없어 기간을 자동 계산할 수 없습니다. "
            "--from / --to 를 직접 지정하세요."
        )
    date_from = dates[0]
    date_to = dates[-1]
    for r in records:
        r["date_from"] = date_from
        r["date_to"] = date_to
    return records, date_from, date_to


async def _replace_rows_for_period(
    supabase: Client,
    table_name: str,
    records: list[dict[str, object]],
    company_code: str,
    date_from: str,
    date_to: str,
    *,
    doc_date_lte_cutoff: str | None,
) -> dict[str, object]:
    """
    동일 조회기간·기업 행 삭제 후 재삽입.
    doc_date_lte_cutoff 가 있으면 그 이하만 삭제(크롤 구간 보호). None 이면 해당 기간 행 전부 삭제.
    """
    if not records:
        return {"inserted": 0, "deleted": 0, "error": None}

    deleted = 0
    try:
        q = (
            supabase.table(table_name)
            .delete(count="exact")
            .eq("company_code", company_code)
            .eq("date_from", date_from)
            .eq("date_to", date_to)
        )
        if doc_date_lte_cutoff is not None:
            q = q.lte("doc_date", doc_date_lte_cutoff)
        del_res = q.execute()
        deleted = int(getattr(del_res, "count", None) or 0)
        if doc_date_lte_cutoff is not None:
            print(f"[Supabase] {table_name} 삭제(doc_date<={doc_date_lte_cutoff}): {deleted}행")
        else:
            print(f"[Supabase] {table_name} 삭제(해당 기간 전체): {deleted}행")
    except Exception as e:
        return {"inserted": 0, "deleted": 0, "error": f"delete: {e}"}

    batch = 300
    total = 0
    try:
        for i in range(0, len(records), batch):
            chunk = records[i : i + batch]
            supabase.table(table_name).insert(chunk).execute()
            total += len(chunk)
            print(f"[Supabase] {table_name} insert: {total}/{len(records)}")
        return {"inserted": total, "deleted": deleted, "error": None}
    except Exception as e:
        return {"inserted": total, "deleted": deleted, "error": f"insert: {e}"}


async def _async_main(args: argparse.Namespace) -> int:
    if not SUPABASE_URL or not SUPABASE_KEY:
        print(
            "[ERROR] NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 를 설정하세요. (.env.local)",
            file=sys.stderr,
        )
        return 1

    menu = _menu_from_arg(args.menu)
    company = args.company.strip().lower()
    cutoff = (args.cutoff or _DEFAULT_CUTOFF).strip()
    full_file = bool(args.full_file)
    auto_period = bool(args.auto_period)

    if auto_period:
        ph_from, ph_to = "1970-01-01", "2099-12-31"
        date_from: str = ph_from
        date_to: str = ph_to
    else:
        if not args.date_from or not args.date_to:
            print(
                "[ERROR] --from 과 --to 를 주거나, --auto-period 를 사용하세요.",
                file=sys.stderr,
            )
            return 1
        date_from = args.date_from.strip()
        date_to = args.date_to.strip()

    path = Path(args.file).expanduser().resolve()
    if not path.is_file():
        print(f"[ERROR] 파일 없음: {path}", file=sys.stderr)
        return 1

    records = _records_from_path(path, menu, company, date_from, date_to)
    if full_file:
        filtered = records
        dropped_gt = 0
        print("[INFO] --full-file: 컷오프 날짜로 행을 걸러내지 않고 파일 정규화 결과 전체를 적재합니다.")
    else:
        filtered, dropped_gt = _filter_doc_date_lte_cutoff(records, cutoff)
        if dropped_gt:
            print(f"[INFO] doc_date > {cutoff} 인 행 {dropped_gt}건은 크롤링 구간으로 간주해 제외했습니다.")

    if auto_period:
        filtered, date_from, date_to = _patch_rows_period_from_doc_dates(filtered)
        print(f"[INFO] --auto-period: 파일 doc_date 기준 date_from={date_from}, date_to={date_to}")

    table_name = _resolve_table_name(menu, company)
    print(f"[INFO] 대상 테이블: {table_name}, 적재 행: {len(filtered)} (정규화 후 {len(records)})")

    if args.dry_run:
        print("[INFO] --dry-run 이므로 DB 작업 없음.")
        return 0

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    result = await _replace_rows_for_period(
        supabase,
        table_name,
        filtered,
        company,
        date_from,
        date_to,
        doc_date_lte_cutoff=None if full_file else cutoff,
    )
    if result.get("error"):
        print(f"[ERROR] {result['error']}", file=sys.stderr)
        return 1
    print(f"[OK] 삭제 {result['deleted']} / 삽입 {result['inserted']}")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Ecount CSV/XLSX -> Supabase")
    parser.add_argument("--company", required=True, choices=["gl", "glpharm", "hnb"], help="기업 코드")
    parser.add_argument(
        "--menu",
        required=True,
        help="purchase | sales | production_receipt",
    )
    parser.add_argument("--file", required=True, help="CSV 또는 XLSX(.xlsx) 파일 경로")
    parser.add_argument(
        "--from",
        dest="date_from",
        default=None,
        help="행 메타 date_from (YYYY-MM-DD). 생략 시 --auto-period 필요",
    )
    parser.add_argument(
        "--to",
        dest="date_to",
        default=None,
        help="행 메타 date_to (YYYY-MM-DD). 생략 시 --auto-period 필요",
    )
    parser.add_argument(
        "--auto-period",
        action="store_true",
        help="--from/--to 생략. 정규화된 행의 doc_date 최소·최대로 기간·행 메타를 맞춤",
    )
    parser.add_argument(
        "--cutoff",
        default=_DEFAULT_CUTOFF,
        help=f"기본 모드에서만 사용. 삽입·삭제 시 doc_date 상한(포함). 기본 {_DEFAULT_CUTOFF}",
    )
    parser.add_argument(
        "--full-file",
        action="store_true",
        help="파일에서 정규화된 행 전부 적재(컷오프로 행 제거 안 함). 같은 company·--from·--to 행은 doc_date 조건 없이 삭제 후 재삽입.",
    )
    parser.add_argument("--dry-run", action="store_true", help="정규화·건수만 출력하고 DB는 건드리지 않음")
    args = parser.parse_args()
    raise SystemExit(asyncio.run(_async_main(args)))


if __name__ == "__main__":
    main()
