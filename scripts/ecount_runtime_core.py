"""
Ecount 런타임 코어 모듈.
변경 이유: 코어는 오케스트레이션만 담당하고 세부 로직은 분리 모듈을 사용합니다.
"""

from __future__ import annotations

import asyncio
import os
import random
import re
from datetime import datetime

import structlog
from playwright.async_api import async_playwright
from supabase import Client, create_client

from ecount_runtime_browser import (
    login,
    pick_alive_page,
    recreate_login_context,
    resolve_menu_page_type,
    run_in_new_process,
    run_menu_once_in_session,
)
from ecount_runtime_company import (
    COMPANY_REGISTRY,
    SUPABASE_KEY,
    SUPABASE_URL,
    TABLE_MAP,
    EcountCompanyCode,
    EcountMenu,
    company_env_prefix,
    cookie_path_for_company,
    credentials_bundle_for_company,
    list_configured_company_codes,
    normalize_company_code,
    remove_cookie_file,
)
from ecount_steps.production_receipt_core import (
    normalize_production_receipt_xlsx as _normalize_production_receipt_xlsx_core,
    replace_production_receipt_rows as _replace_production_receipt_rows_core,
)
from ecount_steps.purchase_core import (
    PURCHASE_EXCEL_HEADER_MAP,
    normalize_purchase_excel_xlsx as _normalize_purchase_excel_xlsx_core,
    replace_purchase_excel_rows as _replace_purchase_excel_rows_core,
)
from ecount_steps.sales_core import (
    SALES_EXCEL_HEADER_MAP,
    normalize_sales_excel_xlsx as _normalize_sales_excel_xlsx_core,
    replace_sales_excel_rows as _replace_sales_excel_rows_core,
)

logger = structlog.get_logger()


def _normalize_table_rows_for_menu(
    menu: EcountMenu,
    rows: list[dict[str, object]],
    company_code: str,
    date_from: str,
    date_to: str,
) -> list[dict[str, object]]:
    """
    변경 이유: DOM 테이블 추출 행(한글 헤더)을 ecount_purchase/ecount_sales 스키마로 정규화합니다.
    """
    if menu not in (EcountMenu.구매현황, EcountMenu.판매현황):
        return rows

    header_map = PURCHASE_EXCEL_HEADER_MAP if menu == EcountMenu.구매현황 else SALES_EXCEL_HEADER_MAP
    norm_map = {k.replace(" ", ""): v for k, v in header_map.items()}
    norm_map["규격"] = "spec"
    norm_map["일자"] = "doc_date"
    norm_map["일자-No"] = "doc_date"
    norm_map["일자-No."] = "doc_date"

    def _to_number(value: object) -> float | None:
        if value is None:
            return None
        text = str(value).strip().replace(",", "")
        if not text:
            return None
        try:
            return float(text)
        except Exception:
            return None

    normalized: list[dict[str, object]] = []
    for row in rows:
        mapped: dict[str, object] = {}
        for raw_key, raw_value in row.items():
            if str(raw_key).startswith("_"):
                continue
            key = str(raw_key).strip()
            key_norm = key.replace(" ", "")
            target = norm_map.get(key_norm)
            if target:
                mapped[target] = raw_value

        doc_date_raw = mapped.get("doc_date")
        doc_no: str | None = None
        if doc_date_raw is not None:
            doc_text = str(doc_date_raw).strip()
            if "-" in doc_text:
                left, right = doc_text.rsplit("-", 1)
                if right.strip().isdigit():
                    doc_text = left.strip()
                    doc_no = right.strip()
            doc_text = doc_text.replace(".", "-").replace("/", "-")
            match = re.search(r"(\d{2,4})\D+(\d{1,2})\D+(\d{1,2})", doc_text)
            if match:
                year = match.group(1)
                month = match.group(2).zfill(2)
                day = match.group(3).zfill(2)
                if len(year) == 2:
                    year = f"20{year}"
                doc_text = f"{year}-{month}-{day}"
            else:
                mapped["doc_date"] = None
                doc_text = ""
            # 변경 이유: 2자리 연도(예: 26-04-01)를 Postgres date 형식(2026-04-01)으로 정규화합니다.
            parts = doc_text.split("-")
            if len(parts) == 3 and len(parts[0]) == 2 and all(p.isdigit() for p in parts):
                doc_text = f"20{parts[0]}-{parts[1]}-{parts[2]}"
            try:
                dt = datetime.fromisoformat(doc_text)
                mapped["doc_date"] = dt.strftime("%Y-%m-%d")
            except Exception:
                if doc_text and len(doc_text) == 8 and doc_text.isdigit():
                    mapped["doc_date"] = f"{doc_text[:4]}-{doc_text[4:6]}-{doc_text[6:]}"
                elif doc_text:
                    mapped["doc_date"] = doc_text
        if doc_no:
            mapped["doc_no"] = doc_no

        for number_col in (
            "qty",
            "unit_price",
            "unit_price_vat",
            "supply_amount",
            "vat_amount",
            "total_amount",
        ):
            if number_col in mapped:
                mapped[number_col] = _to_number(mapped.get(number_col))

        mapped["company_code"] = company_code
        mapped["date_from"] = date_from
        mapped["date_to"] = date_to
        mapped["crawled_at"] = datetime.now().isoformat()

        required = ("doc_date", "erp_code")
        if all(str(mapped.get(k) or "").strip() for k in required):
            normalized.append(mapped)
    return normalized


async def _save_to_supabase(
    data: list[dict],
    table_name: str,
    supabase: Client,
) -> dict:
    """추출된 데이터를 Supabase 테이블에 upsert합니다."""
    if not data:
        return {"inserted": 0, "error": None}
    try:
        batch_size = 100
        total_inserted = 0
        for i in range(0, len(data), batch_size):
            batch = data[i : i + batch_size]
            supabase.table(table_name).upsert(batch).execute()
            total_inserted += len(batch)
            print(f"[Supabase] {table_name}: {total_inserted}/{len(data)}행 저장 완료")
        return {"inserted": total_inserted, "error": None}
    except Exception as e:
        logger.error("supabase_save_failed", table=table_name, error=str(e))
        return {"inserted": 0, "error": str(e)}


class EcountCrawler:
    """이카운트 ERP 크롤러 오케스트레이터."""

    def __init__(self, company_code: str | EcountCompanyCode | None = None) -> None:
        # 변경 이유: company_code=None 이면 기존과 동일하게 지엘팜을 기본 기업으로 둡니다.
        normalized = normalize_company_code(company_code)
        if company_env_prefix(normalized) is None:
            raise ValueError(
                f"알 수 없는 기업 코드: {company_code!r} - "
                f"{[co.value for co, _, _ in COMPANY_REGISTRY]} 중 하나를 쓰세요."
            )
        bundle = credentials_bundle_for_company(normalized)
        if bundle is None:
            pref = company_env_prefix(normalized)
            raise ValueError(
                f"기업 '{normalized}' 이카운트 자격증명이 없습니다. "
                f"{pref}_COM_CODE, {pref}_USER_ID, {pref}_USER_PW 를 .env.local에 설정하세요."
            )
        self.company_code = normalized
        self.credentials: dict[str, object] = bundle
        self.cookie_path = cookie_path_for_company(normalized)
        self.supabase: Client | None = None
        if SUPABASE_URL and SUPABASE_KEY:
            self.supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    async def crawl_and_save(
        self,
        menu: EcountMenu,
        date_from: str | None = None,
        date_to: str | None = None,
        save_to_db: bool = True,
        company: str | EcountCompanyCode | None = None,
    ) -> dict:
        import concurrent.futures

        if not date_from:
            date_from = "2024-01-01"
        if not date_to:
            date_to = datetime.now().strftime("%Y-%m-%d")

        effective_code = normalize_company_code(company) if company is not None else self.company_code
        if company is not None:
            if company_env_prefix(effective_code) is None:
                raise ValueError(
                    f"crawl_and_save(company=...) 알 수 없는 코드: {company!r} - "
                    f"{[co.value for co, _, _ in COMPANY_REGISTRY]} 중 하나"
                )
            bundle = credentials_bundle_for_company(effective_code)
            if bundle is None:
                pref = company_env_prefix(effective_code)
                raise ValueError(
                    f"기업 '{effective_code}' 자격증명 없음: "
                    f"{pref}_COM_CODE / USER_ID / USER_PW 확인"
                )
            run_credentials: dict[str, object] = bundle
            run_cookie_path = cookie_path_for_company(effective_code)
        else:
            run_credentials = self.credentials
            run_cookie_path = self.cookie_path

        loop = asyncio.get_event_loop()
        with concurrent.futures.ProcessPoolExecutor(max_workers=1) as executor:
            raw_payload = await loop.run_in_executor(
                executor,
                run_in_new_process,
                menu.value,
                date_from,
                date_to,
                run_cookie_path,
                run_credentials,
            )

        rows: list[dict[str, object]] = []
        if isinstance(raw_payload, dict) and raw_payload.get("extractor") == "excel":
            blob = raw_payload.get("bytes")
            if isinstance(blob, (bytes, bytearray)) and len(blob) > 0:
                rows = _normalize_production_receipt_xlsx_core(
                    raw=bytes(blob),
                    company_code=effective_code,
                    date_from=date_from,
                    date_to=date_to,
                )
        elif isinstance(raw_payload, dict):
            maybe_rows = raw_payload.get("rows")
            if isinstance(maybe_rows, list):
                rows = [dict(r) for r in maybe_rows if isinstance(r, dict)]

        result: dict[str, object] = {
            "menu": menu.value,
            "rows": rows,
            "inserted": 0,
            "error": None,
        }

        if save_to_db and rows:
            table_name = TABLE_MAP.get(menu, f"ecount_{menu.value}")
            if self.supabase is None:
                return {
                    "menu": menu.value,
                    "rows": rows,
                    "inserted": 0,
                    "error": "SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.",
                }
            if menu == EcountMenu.생산입고조회:
                save_result = await _replace_production_receipt_rows_core(
                    supabase=self.supabase,
                    table_name=table_name,
                    records=rows,
                    company_code=effective_code,
                    date_from=date_from,
                    date_to=date_to,
                )
            else:
                save_result = await _save_to_supabase(rows, table_name, self.supabase)
            result["inserted"] = int(save_result.get("inserted", 0) or 0)
            result["error"] = save_result.get("error")
        return result

    async def crawl_multi_menus_and_save(
        self,
        menus: list[EcountMenu],
        date_from: str | None = None,
        date_to: str | None = None,
        save_to_db: bool = True,
        company: str | EcountCompanyCode | None = None,
        page_types: dict[str, str] | None = None,
        table_overrides: dict[str, str] | None = None,
        retry_per_menu: int = 2,
    ) -> list[dict[str, object]]:
        if not date_from:
            date_from = "2024-01-01"
        if not date_to:
            date_to = datetime.now().strftime("%Y-%m-%d")
        if not menus:
            return []

        effective_code = normalize_company_code(company) if company is not None else self.company_code
        if company is not None:
            if company_env_prefix(effective_code) is None:
                raise ValueError(
                    f"crawl_multi_menus_and_save(company=...) 알 수 없는 코드: {company!r}"
                )
            bundle = credentials_bundle_for_company(effective_code)
            if bundle is None:
                pref = company_env_prefix(effective_code)
                raise ValueError(
                    f"기업 '{effective_code}' 자격증명 없음: "
                    f"{pref}_COM_CODE / USER_ID / USER_PW 확인"
                )
            run_credentials: dict[str, object] = bundle
            run_cookie_path = cookie_path_for_company(effective_code)
        else:
            run_credentials = self.credentials
            run_cookie_path = self.cookie_path

        results: list[dict[str, object]] = []
        async with async_playwright() as playwright_instance:
            remove_cookie_file(run_cookie_path)
            context_kwargs: dict[str, object] = {
                "user_agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
                "locale": "ko-KR",
                "timezone_id": "Asia/Seoul",
                "accept_downloads": True,
            }
            browser, context, page = await recreate_login_context(playwright_instance, context_kwargs)

            login_success = False
            for attempt in range(2):
                login_success = await login(page, run_credentials)
                if login_success:
                    page = pick_alive_page(page)
                    break
                try:
                    await browser.close()
                except Exception:
                    pass
                if attempt < 1:
                    browser, context, page = await recreate_login_context(
                        playwright_instance,
                        context_kwargs,
                    )
                await asyncio.sleep(0.8)

            if not login_success:
                try:
                    await browser.close()
                except Exception:
                    pass
                raise RuntimeError(
                    "[Ecount] 자동 로그인 실패. .env 자격증명(ECOUNT_*_COM_CODE/USER_ID/USER_PW)과 "
                    "보안문자/2차인증 유무를 확인하세요."
                )

            os.makedirs(os.path.dirname(run_cookie_path), exist_ok=True)
            await context.storage_state(path=run_cookie_path)

            try:
                for menu in menus:
                    menu_page_type = (
                        page_types.get(menu.value)
                        if page_types and menu.value in page_types
                        else resolve_menu_page_type(menu)
                    )
                    attempt_error: str | None = None
                    payload: dict[str, object] | None = None

                    for retry_idx in range(retry_per_menu + 1):
                        try:
                            page, payload = await run_menu_once_in_session(
                                page=page,
                                menu=menu,
                                date_from=date_from,
                                date_to=date_to,
                                credentials=run_credentials,
                                page_type=menu_page_type,
                            )
                            attempt_error = None
                            break
                        except Exception as e:
                            attempt_error = str(e)
                            if retry_idx < retry_per_menu:
                                await asyncio.sleep(1.0)

                    rows: list[dict[str, object]] = []
                    if payload and payload.get("extractor") == "table":
                        maybe_rows = payload.get("rows")
                        if isinstance(maybe_rows, list):
                            rows = [dict(r) for r in maybe_rows if isinstance(r, dict)]
                    elif payload and payload.get("extractor") == "excel":
                        blob = payload.get("bytes")
                        if isinstance(blob, (bytes, bytearray)) and len(blob) > 0:
                            if menu == EcountMenu.생산입고조회:
                                rows = _normalize_production_receipt_xlsx_core(
                                    raw=bytes(blob),
                                    company_code=effective_code,
                                    date_from=date_from,
                                    date_to=date_to,
                                )
                            elif menu == EcountMenu.구매현황:
                                rows = _normalize_purchase_excel_xlsx_core(
                                    raw=bytes(blob),
                                    company_code=effective_code,
                                    date_from=date_from,
                                    date_to=date_to,
                                )
                            elif menu == EcountMenu.판매현황:
                                rows = _normalize_sales_excel_xlsx_core(
                                    raw=bytes(blob),
                                    company_code=effective_code,
                                    date_from=date_from,
                                    date_to=date_to,
                                )
                    if payload and payload.get("extractor") == "table":
                        rows = _normalize_table_rows_for_menu(
                            menu=menu,
                            rows=rows,
                            company_code=effective_code,
                            date_from=date_from,
                            date_to=date_to,
                        )

                    result: dict[str, object] = {
                        "menu": menu.value,
                        "rows": rows,
                        "inserted": 0,
                        "error": attempt_error,
                        "page_type": menu_page_type,
                    }

                    if save_to_db and rows and self.supabase is not None:
                        table_name = TABLE_MAP.get(menu, f"ecount_{menu.value}")
                        if table_overrides and menu.value in table_overrides:
                            table_name = str(table_overrides[menu.value]).strip() or table_name
                        extractor = payload.get("extractor") if isinstance(payload, dict) else None
                        if menu == EcountMenu.생산입고조회:
                            save_res = await _replace_production_receipt_rows_core(
                                supabase=self.supabase,
                                table_name=table_name,
                                records=rows,
                                company_code=effective_code,
                                date_from=date_from,
                                date_to=date_to,
                            )
                        elif menu == EcountMenu.구매현황 and extractor == "excel":
                            save_res = await _replace_purchase_excel_rows_core(
                                supabase=self.supabase,
                                table_name=table_name,
                                records=rows,
                                company_code=effective_code,
                                date_from=date_from,
                                date_to=date_to,
                            )
                        elif menu == EcountMenu.판매현황 and extractor == "excel":
                            save_res = await _replace_sales_excel_rows_core(
                                supabase=self.supabase,
                                table_name=table_name,
                                records=rows,
                                company_code=effective_code,
                                date_from=date_from,
                                date_to=date_to,
                            )
                        else:
                            save_res = await _save_to_supabase(rows, table_name, self.supabase)
                        result["inserted"] = int(save_res.get("inserted", 0) or 0)
                        result["error"] = save_res.get("error") or result["error"]
                    results.append(result)
            finally:
                await browser.close()
        return results

    async def crawl_all(
        self,
        date_from: str | None = None,
        date_to: str | None = None,
        menus: list[EcountMenu] | None = None,
    ) -> list[dict]:
        """여러 메뉴 순차 크롤링. 날짜 미지정 시 2024-01-01 ~ 오늘."""
        if not date_from:
            date_from = "2024-01-01"
        if not date_to:
            date_to = datetime.now().strftime("%Y-%m-%d")
        target_menus = menus or [EcountMenu.구매현황, EcountMenu.판매현황]
        results = []
        for menu in target_menus:
            result = await self.crawl_and_save(menu, date_from, date_to)
            results.append(result)
            await asyncio.sleep(random.uniform(1.0, 2.0))
        return results


if __name__ == "__main__":
    import argparse

    known_company_codes = [co.value for co, _, _ in COMPANY_REGISTRY]
    parser = argparse.ArgumentParser(description="Ecount ERP Crawler")
    parser.add_argument(
        "--menu",
        default="purchase",
        choices=[m.value for m in EcountMenu],
        help="purchase/sales/.../production_receipt(생산입고조회·엑셀)",
    )
    parser.add_argument("--from", dest="date_from", default="2024-01-01")
    parser.add_argument(
        "--to",
        dest="date_to",
        default=datetime.now().strftime("%Y-%m-%d"),
    )
    parser.add_argument(
        "--company",
        default="glpharm",
        help=f"기업 코드 ({', '.join(known_company_codes)}) 또는 all",
    )
    parser.add_argument("--no-db", action="store_true", help="DB 저장 스킵")
    parser.add_argument("--debug", action="store_true", help="디버그 로그 출력")
    args = parser.parse_args()

    if args.debug:
        os.environ["ECOUNT_DEBUG"] = "1"
    menu_enum = EcountMenu(args.menu)

    async def main() -> None:
        if args.company.strip().lower() == "all":
            targets = list_configured_company_codes()
            if not targets:
                print("[Ecount] --company all 이지만 순회할 기업이 없습니다.")
                return
        else:
            targets = [args.company.strip().lower()]
        for code in targets:
            try:
                crawler = EcountCrawler(company_code=code)
            except ValueError as err:
                print(f"[Ecount] 건너뜀: {err}")
                continue
            result = await crawler.crawl_and_save(
                menu=menu_enum,
                date_from=args.date_from,
                date_to=args.date_to,
                save_to_db=not args.no_db,
            )
            print(f"\n결과({code}): {result['inserted']}행 저장 | 에러: {result['error']}")
            for row in result["rows"][:3]:
                print(row)

    asyncio.run(main())
