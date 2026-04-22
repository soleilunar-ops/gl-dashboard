"""
GL-RADS | Ecount ERP 크롤러
대상: https://login.ecount.com
메뉴: 구매현황(E040305) · 생산외주(E040410, 지엘만) · 판매현황(E040207) · 재고수불부(E040702)
      · 생산입고조회(지엘만, prgId는 .env ECOUNT_GL_PRODUCTION_RECEIPT_PRG_ID)
저장: ecount_purchase · ecount_production_outsource · ecount_sales · ecount_stock_ledger
      · ecount_production_receipt

브라우저 날짜·기간 필터는 조작하지 않음 — ERP 화면 기본값 사용.
CLI --from/--to 는 records의 date_from/date_to 메타(이번 실행의 “의도된 조회기간”)에만 기록.
v2.9.1: save_to_supabase_replace의 DELETE 는 CLI 기간이 아니라 수집 레코드의 doc_date min~max 만 대상.
v2.9.3: item_erp_mapping mapping_status 없는 DB 폴백, ecount_* INSERT 지문·ecount_sales erp_code 사전 제거.
지엘 판매 GL_* 해시 오염 정리(수동, SQL Editor): DELETE FROM public.ecount_sales
WHERE company_code='gl' AND erp_code LIKE 'GL_%';
지엘 판매(E040207): 품목코드 열 없음 → item_erp_mapping(verified·ai_suggested)의
erp_item_name·erp_spec으로 역매칭(로컬 DB는 verified 0·ai_suggested 144 실측).
--dry-run-mapping: INSERT 생략·매칭률 90% 미만이면 오류 종료.
───────────────────────────────────────────────────────────────
"""
from __future__ import annotations

import os
import sys
import io
import re
import unicodedata
import asyncio
import random
import json
from datetime import datetime
from enum import Enum
from typing import Any

import pandas as pd
import structlog
from playwright.async_api import Frame, async_playwright, Download, Page
from supabase import create_client, Client

logger = structlog.get_logger()

# Windows 레거시 콘솔(cp949)에서 유니코드 출력 시 UnicodeEncodeError 방지
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except (OSError, ValueError):
        pass

# ──────────────────────────────────────────────
# .env.local 로드
# ──────────────────────────────────────────────
try:
    from dotenv import load_dotenv  # type: ignore

    _PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    _ENV_LOCAL = os.path.join(_PROJECT_ROOT, ".env.local")
    if os.path.exists(_ENV_LOCAL):
        load_dotenv(dotenv_path=_ENV_LOCAL, override=False)
        print(f"[Ecount] 환경변수 로드: {_ENV_LOCAL}")
    else:
        print(f"[Ecount] .env.local 미발견: {_ENV_LOCAL}")
except Exception:
    pass

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")


# ──────────────────────────────────────────────
# Enum / 메뉴 정의
# ──────────────────────────────────────────────
class EcountMenu(str, Enum):
    구매현황 = "purchase"
    생산외주 = "production_outsource"
    판매현황 = "sales"
    재고수불부 = "stock_ledger"
    생산입고조회 = "production_receipt"


class EcountCompanyCode(str, Enum):
    """item_erp_mapping.erp_system 값과 동일."""

    gl = "gl"
    gl_pharm = "gl_pharm"
    hnb = "hnb"


# 메뉴 → Supabase 테이블
TABLE_MAP: dict[EcountMenu, str] = {
    EcountMenu.구매현황: "ecount_purchase",
    EcountMenu.생산외주: "ecount_production_outsource",
    EcountMenu.판매현황: "ecount_sales",
    EcountMenu.재고수불부: "ecount_stock_ledger",
    EcountMenu.생산입고조회: "ecount_production_receipt",
}

# 메뉴 해시 — 각 메뉴가 완전한 nav 세트 보유 (v2.8.3)
# 실측 (2026-04-19):
#   구매현황:   MENUTREE_000513 / MENUTREE_000031 / E040305 / 4
#   판매현황:   MENUTREE_000573 / MENUTREE_000035 / E040207 / 4 (구매와 메뉴트리 분리 필수)
#   재고수불부: MENUTREE_000215 / MENUTREE_000035 / E040702 / 4
#   생산입고조회: 코드 기본값은 플레이스홀더 — 지엘은 .env로 덮음:
#     ECOUNT_GL_PRODUCTION_RECEIPT_PRG_ID | _MENU_TYPE | _MENU_SEQ | _GROUP_SEQ | _DEPTH
MENU_HASH: dict[EcountMenu, dict[str, str]] = {
    EcountMenu.구매현황: {
        "menu_seq": "MENUTREE_000513",
        "group_seq": "MENUTREE_000031",
        "prg_id": "E040305",
        "depth": "4",
    },
    EcountMenu.생산외주: {
        "menu_seq": "MENUTREE_000513",
        "group_seq": "MENUTREE_000031",
        "prg_id": "E040410",
        "depth": "4",
    },
    EcountMenu.판매현황: {
        "menu_seq": "MENUTREE_000573",
        "group_seq": "MENUTREE_000035",
        "prg_id": "E040207",
        "depth": "4",
    },
    EcountMenu.재고수불부: {
        "menu_seq": "MENUTREE_000215",
        "group_seq": "MENUTREE_000035",
        "prg_id": "E040702",
        "depth": "4",
    },
    EcountMenu.생산입고조회: {
        "menu_seq": "MENUTREE_000215",
        "group_seq": "MENUTREE_000035",
        "prg_id": "",
        "depth": "4",
    },
}

_DEFAULT_MENU_TREE: dict[str, str] = {
    "menu_type": "MENUTREE_000004",  # menu_type만 공통값
}

# 기업별 메뉴 매트릭스 (이카운트 크롤링 로직 문서와 동일)
COMPANY_MENUS: dict[str, list[EcountMenu]] = {
    "gl": [
        EcountMenu.구매현황,
        EcountMenu.생산외주,
        EcountMenu.판매현황,
        EcountMenu.재고수불부,
        EcountMenu.생산입고조회,
    ],
    "gl_pharm": [
        EcountMenu.구매현황,
        EcountMenu.판매현황,
        EcountMenu.재고수불부,
    ],
    "hnb": [
        EcountMenu.구매현황,
        EcountMenu.판매현황,
        EcountMenu.재고수불부,
    ],
}

COMPANY_REGISTRY: list[tuple[EcountCompanyCode, str, str]] = [
    (EcountCompanyCode.gl, "지엘", "ECOUNT_GL"),
    (EcountCompanyCode.gl_pharm, "지엘팜", "ECOUNT_GL_PHARM"),
    (EcountCompanyCode.hnb, "에이치앤비", "ECOUNT_HNB"),
]


# ──────────────────────────────────────────────
# 컬럼 정규화 맵 — 엑셀 헤더 → Supabase 컬럼
# ──────────────────────────────────────────────
COLUMN_NORMALIZE: dict[str, dict[str, dict[str, str]]] = {
    "gl": {
        "purchase": {
            "년/월/일": "doc_date",
            "품목코드": "erp_code",
            "품명 및 규격": "product_name",
            "수량": "qty",
            "단가": "unit_price",
            "포함단가": "unit_price_vat",
            "공급가액": "supply_amount",
            "부가세": "vat_amount",
            "합계": "total_amount",
            "적요": "memo",
            "구매처명": "counterparty",
        },
        "stock_ledger": {
            "일자": "doc_date",
            "거래처명": "counterparty",
            "적요": "memo",
            "입고수량": "inbound_qty",
            "출고수량": "outbound_qty",
        },
        # 생산외주 엑셀 헤더는 구매현황과 동일 형태라 가정 — 실측 다르면 키만 조정
        "production_outsource": {
            "년/월/일": "doc_date",
            "품목코드": "erp_code",
            "품명 및 규격": "product_name",
            "수량": "qty",
            "단가": "unit_price",
            "포함단가": "unit_price_vat",
            "공급가액": "supply_amount",
            "부가세": "vat_amount",
            "합계": "total_amount",
            "적요": "memo",
            "구매처명": "counterparty",
        },
        # 판매현황 E040207 실측(gl_sales): 품목코드 열 없음 — 아래 키는 엑셀 헤더 원문과 동일(_norm_header로 공백만 무시해 매칭)
        "sales": {
            "월/일": "doc_date",
            "품명 및 규격": "product_name",
            "수량": "qty",
            "단가": "unit_price",
            "단가(포함)": "unit_price_vat",
            "공급가액": "supply_amount",
            "부가세": "vat_amount",
            "합 계": "total_amount",
            "판매처명": "counterparty",
            "적요": "memo",
            # "회계반영일자" → 스키마 미반영으로 매핑 생략(추후 활용)
        },
    },
    "gl_pharm": {
        "purchase": {
            "일자-No.": "doc_date",
            "품목코드": "erp_code",
            "품목명(규격)": "product_name",
            "수량": "qty",
            "단가": "unit_price",
            "공급가액": "supply_amount",
            "부가세": "vat_amount",
            "합계": "total_amount",
            "거래처명": "counterparty",
        },
        "sales": {
            "일자-No.": "doc_date",
            "품목코드": "erp_code",
            "품목명(규격)": "product_name",
            "수량": "qty",
            "단가": "unit_price",
            "공급가액": "supply_amount",
            "부가세": "vat_amount",
            "합계": "total_amount",
            "거래처명": "counterparty",
        },
        "stock_ledger": {
            "일자": "doc_date",
            "거래처명": "counterparty",
            "적요": "memo",
            "입고수량": "inbound_qty",
            "출고수량": "outbound_qty",
        },
    },
    "hnb": {
        "purchase": {
            "년/월/일": "doc_date",
            "품목코드": "erp_code",
            "품명 및 규격": "product_name",
            "수량": "qty",
            "단가": "unit_price",
            "단가(vat포함)": "unit_price_vat",
            "공급가액": "supply_amount",
            "부가세": "vat_amount",
            "합계": "total_amount",
            "구매처명": "counterparty",
        },
        "sales": {
            "년/월/일": "doc_date",
            "품목코드": "erp_code",
            "품명 및 규격": "product_name",
            "수량": "qty",
            "단가": "unit_price",
            "공급가액": "supply_amount",
            "부가세": "vat_amount",
            "합 계": "total_amount",
            "판매처명": "counterparty",
            "적요": "memo",
        },
        "stock_ledger": {
            "일자": "doc_date",
            "거래처명": "counterparty",
            "적요": "memo",
            "입고수량": "inbound_qty",
            "출고수량": "outbound_qty",
        },
    },
}

NUMERIC_COLS = (
    "qty",
    "unit_price",
    "unit_price_vat",
    "supply_amount",
    "vat_amount",
    "total_amount",
    "inbound_qty",
    "outbound_qty",
)

# gl/sales 역매칭 dry-run: 이 비율 미만이면 INSERT 금지(의심)
GL_SALES_MAPPING_MIN_OK_PCT: float = 90.0


# ──────────────────────────────────────────────
# 기업 코드 헬퍼
# ──────────────────────────────────────────────
def normalize_company_code(company_code: str | EcountCompanyCode | None) -> str:
    if company_code is None:
        return EcountCompanyCode.gl_pharm.value
    if isinstance(company_code, EcountCompanyCode):
        return company_code.value
    return company_code.strip().lower().replace("-", "_")


def company_env_prefix(company_code: str | EcountCompanyCode | None) -> str | None:
    normalized = normalize_company_code(company_code)
    for co, _label, prefix in COMPANY_REGISTRY:
        if co.value == normalized:
            return prefix
    return None


def company_label(company_code: str) -> str:
    normalized = normalize_company_code(company_code)
    for co, label, _p in COMPANY_REGISTRY:
        if co.value == normalized:
            return label
    return normalized


def credentials_bundle_for_company(
    company_code: str | EcountCompanyCode | None,
) -> dict[str, Any] | None:
    normalized = normalize_company_code(company_code)
    prefix = company_env_prefix(normalized)
    if prefix is None:
        return None
    com = (os.getenv(f"{prefix}_COM_CODE") or "").strip()
    uid = (os.getenv(f"{prefix}_USER_ID") or "").strip()
    pw = (os.getenv(f"{prefix}_USER_PW") or "").strip()
    if not com or not uid or not pw:
        return None
    return {
        "com_code": com,
        "user_id": uid,
        "password": pw,
        "company_code": normalized,
        "company_label": company_label(normalized),
        "menu_navigation": _load_menu_navigation(prefix),
    }


def list_configured_company_codes() -> list[str]:
    return [
        co.value
        for co, _l, _p in COMPANY_REGISTRY
        if credentials_bundle_for_company(co.value) is not None
    ]


def cookie_path_for_company(company_code: str | EcountCompanyCode | None) -> str:
    normalized = normalize_company_code(company_code)
    cookie_dir = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "storage", "cookies"
    )
    return os.path.join(cookie_dir, f"ecount_session_{normalized}.json")


# ──────────────────────────────────────────────
# 메뉴 네비게이션
# ──────────────────────────────────────────────
def _nav_block(prefix: str, block: str, menu: EcountMenu) -> dict[str, str]:
    hash_base = MENU_HASH[menu]
    result = {
        **_DEFAULT_MENU_TREE,
        **hash_base,
    }
    for py_key, env_suffix in (
        ("prg_id", "PRG_ID"),
        ("menu_type", "MENU_TYPE"),
        ("menu_seq", "MENU_SEQ"),
        ("group_seq", "GROUP_SEQ"),
        ("depth", "DEPTH"),
    ):
        val = os.getenv(f"{prefix}_{block}_{env_suffix}")
        if val and val.strip():
            result[py_key] = val.strip()
    return result


def _load_menu_navigation(prefix: str) -> dict[str, dict[str, str]]:
    return {
        EcountMenu.구매현황.value: _nav_block(prefix, "PURCHASE", EcountMenu.구매현황),
        EcountMenu.생산외주.value: _nav_block(
            prefix, "PRODUCTION_OUTSOURCE", EcountMenu.생산외주
        ),
        EcountMenu.판매현황.value: _nav_block(prefix, "SALES", EcountMenu.판매현황),
        EcountMenu.재고수불부.value: _nav_block(
            prefix, "STOCK_LEDGER", EcountMenu.재고수불부
        ),
        EcountMenu.생산입고조회.value: _nav_block(
            prefix, "PRODUCTION_RECEIPT", EcountMenu.생산입고조회
        ),
    }


def resolve_menu_navigation(
    menu_enum: EcountMenu, credentials: dict[str, Any]
) -> dict[str, str]:
    nav_root = credentials.get("menu_navigation")
    if not isinstance(nav_root, dict):
        raise ValueError("credentials에 menu_navigation이 없습니다.")
    block = nav_root.get(menu_enum.value)
    if not isinstance(block, dict):
        raise ValueError(f"menu_navigation[{menu_enum.value}] 없음")
    return block


# ──────────────────────────────────────────────
# ProcessPoolExecutor 진입점
# ──────────────────────────────────────────────
def _run_in_new_process(
    menu: str,
    date_from: str,
    date_to: str,
    cookie_path: str,
    credentials: dict,
) -> bytes | None:
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    return asyncio.run(
        _crawl_to_xlsx(menu, date_from, date_to, cookie_path, credentials)
    )


# ──────────────────────────────────────────────
# 로그인 / 세션
# ──────────────────────────────────────────────
async def _dismiss_login_popup(page: Page) -> bool:
    dismissed_count = 0
    for attempt in range(3):
        try:
            res = await page.evaluate(
                r"""() => {
                    const tryClick = (el, strategy) => {
                        if (!el || typeof el.click !== 'function') return null;
                        el.click();
                        return {
                            strategy,
                            text: (el.innerText || el.title || el.getAttribute('aria-label') || '')
                                .trim().slice(0, 40),
                        };
                    };
                    const isVisible = (el) => {
                        if (!el) return false;
                        const s = getComputedStyle(el);
                        return s.display !== 'none' && s.visibility !== 'hidden' &&
                               el.offsetParent !== null;
                    };
                    const confirmBtn = [...document.querySelectorAll(
                        'button, a, input[type="button"], input[type="submit"]'
                    )].find(el => {
                        if (!isVisible(el)) return false;
                        const t = (el.innerText || el.value || '').trim();
                        return t === '확인';
                    });
                    const r1 = tryClick(confirmBtn, 'confirm');
                    if (r1) return r1;
                    for (const attr of ['title', 'aria-label']) {
                        const el = [...document.querySelectorAll(`[${attr}]`)].find(e => {
                            if (!isVisible(e)) return false;
                            const v = (e.getAttribute(attr) || '').toLowerCase();
                            return v.includes('닫기') || v.includes('close');
                        });
                        const r = tryClick(el, attr);
                        if (r) return r;
                    }
                    const byClass = [...document.querySelectorAll(
                        '.close, .btn-close, .modal-close, .dialog-close, button.close, .popup-close'
                    )].find(isVisible);
                    const r3 = tryClick(byClass, 'class');
                    if (r3) return r3;
                    const xTexts = ['X', '×', '✕', '✖'];
                    const byText = [...document.querySelectorAll(
                        'button, a, span[role="button"], div[role="button"]'
                    )].find(e => {
                        if (!isVisible(e)) return false;
                        const t = (e.innerText || e.textContent || '').trim();
                        return xTexts.includes(t);
                    });
                    const r4 = tryClick(byText, 'x-text');
                    if (r4) return r4;
                    return { strategy: null };
                }"""
            )
            if res and res.get("strategy"):
                dismissed_count += 1
                strategy = res["strategy"]
                print(
                    f"[Ecount] 팝업 처리 ({attempt + 1}회): "
                    f"{strategy} / '{res.get('text', '')}'"
                )
                wait_sec = 2.0 if strategy == "confirm" else 0.8
                await asyncio.sleep(wait_sec)
                continue
            await page.keyboard.press("Escape")
            await asyncio.sleep(0.5)
            break
        except Exception as e:
            print(f"[Ecount] 팝업 처리 예외 ({attempt + 1}회): {e}")
            break

    if dismissed_count:
        print(f"[Ecount] 팝업 총 {dismissed_count}회 처리")
        return True
    print("[Ecount] 처리할 팝업 없음")
    return False


async def _login(page: Page, credentials: dict) -> bool:
    try:
        await page.goto(
            "https://login.ecount.com/Login/?lan_type=ko-KR/",
            wait_until="domcontentloaded",
            timeout=30000,
        )
        await asyncio.sleep(random.uniform(0.4, 0.8))
        await page.fill("#com_code", credentials["com_code"])
        await page.fill("#id", credentials["user_id"])
        await page.fill("#passwd", credentials["password"])
        await page.click("#save")

        try:
            await page.wait_for_load_state("networkidle", timeout=15000)
        except Exception:
            pass
        try:
            await page.wait_for_url(
                lambda u: "/Login" not in u and u.rstrip("/") != "https://login.ecount.com",
                timeout=10000,
            )
        except Exception:
            pass
        await asyncio.sleep(random.uniform(1.2, 1.8))

        if "login.ecount.com" in page.url and "logincc" not in page.url:
            err = await page.query_selector("#error_msg, .login_error")
            if err:
                msg = await err.get_attribute("value") or await err.inner_text()
                print(f"[Ecount] 로그인 실패: {msg}")
            return False

        print(f"[Ecount] 로그인 성공: {page.url}")

        if "erp_login" in page.url or "/app.login/" in page.url:
            await _dismiss_login_popup(page)
            try:
                await page.wait_for_load_state("networkidle", timeout=10000)
            except Exception:
                pass
            await asyncio.sleep(0.5)
            print(f"[Ecount] 팝업 처리 후 URL: {page.url}")

        return True
    except Exception as e:
        print(f"[Ecount] 로그인 예외: {e}")
        return False


async def _check_session(page: Page) -> bool:
    try:
        await page.goto(
            "https://login.ecount.com/Login/?lan_type=ko-KR/",
            wait_until="domcontentloaded",
            timeout=20000,
        )
        await asyncio.sleep(random.uniform(0.3, 0.5))
        login_form = await page.query_selector('input[name="COM_CODE"], #COM_CODE')
        if login_form or "Login" in page.url:
            return False
        return True
    except Exception:
        return False


# ──────────────────────────────────────────────
# ERP 조회 — 날짜·필터는 스크립트에서 건드리지 않고 UI 기본값 사용
# ──────────────────────────────────────────────
async def _trigger_erp_search_default_ui(page: Page) -> None:
    """날짜/드롭다운 미조작. 검색(F8)만 실행해 그리드 로드. 조회품목 재지정 팝업 처리 유지."""
    root: Page | Frame = page.frame(name="s_page") or page
    try:
        clicked = await root.evaluate(
            """() => {
                const cands = [...document.querySelectorAll(
                    'button, a, div[role="button"], span[role="button"]'
                )];
                const btn = cands.find(b => {
                    const t = (b.innerText || '').trim();
                    return t === '검색(F8)' || t.startsWith('검색(F8)');
                });
                if (btn) { btn.click(); return '검색(F8)'; }
                const byId = document.getElementById('header_search');
                if (byId) { byId.click(); return 'header_search'; }
                return null;
            }"""
        )
        if not clicked:
            clicked = await page.evaluate(
                """() => {
                    const cands = [...document.querySelectorAll(
                        'button, a, div[role="button"], span[role="button"]'
                    )];
                    const btn = cands.find(b => {
                        const t = (b.innerText || '').trim();
                        return t === '검색(F8)' || t.startsWith('검색(F8)');
                    });
                    if (btn) { btn.click(); return '검색(F8)'; }
                    return null;
                }"""
            )
        if not clicked:
            await page.keyboard.press("F8")
        print(
            "[Ecount] 검색(F8) 실행 — 기간·날짜는 ERP 화면 기본값 (스크립트 미조작)"
        )

        popped = None
        try:
            # 팝업 폴링: 0.1s 간격 × 30회 = 최대 3s (기존 0.3s × 33회 = 9.9s)
            for attempt in range(30):
                popped = await page.evaluate(
                    r"""() => {
                        const all = [...document.querySelectorAll('body *')];
                        const target = all.find(el => {
                            const t = (el.innerText || '').replace(/\s+/g, '');
                            return t.includes('조회품목을재지정') &&
                                el.offsetParent !== null;
                        });
                        if (!target) return null;
                        let container = target;
                        for (let i = 0; i < 5 && container; i++) {
                            const btns = [...container.querySelectorAll('button, a')];
                            const cancel = btns.find(
                                b => (b.innerText || '').trim() === '취소'
                            );
                            if (cancel) { cancel.click(); return '취소'; }
                            container = container.parentElement;
                        }
                        return null;
                    }"""
                )
                if popped:
                    print(
                        f"[Ecount] 검색 후 '조회품목 재지정' 팝업 "
                        f"({attempt * 0.1:.1f}s 대기) → '{popped}' 클릭"
                    )
                    await asyncio.sleep(0.3)
                    break
                await asyncio.sleep(0.1)
            if not popped:
                print("[Ecount] 조회품목 재지정 팝업 없음 (바로 결과 렌더)")
        except Exception as e:
            print(f"[Ecount] 검색 후 팝업 처리 예외(무시): {e}")

    except Exception as e:
        print(f"[Ecount] 검색(F8) 트리거 실패: {e}")



# ──────────────────────────────────────────────
# 엑셀 다운로드
# ──────────────────────────────────────────────
EXCEL_BUTTON_SELECTORS = [
    'button:has-text("Excel(화면)")',
    'button:has-text("Excel(전체)")',
    'a:has-text("Excel(화면)")',
    'a:has-text("Excel(전체)")',
    'button:has-text("엑셀")',
    'a:has-text("엑셀")',
    'button:has-text("Excel")',
    '[title*="엑셀"]',
    '[title*="Excel"]',
    '[data-action="excel"]',
    'img[src*="excel"]',
]


async def _expand_pagination_if_needed(page: Page, menu: EcountMenu) -> None:
    """구매·생산외주 등 그리드: '천건이상조회' 자동 클릭."""
    if menu not in (EcountMenu.구매현황, EcountMenu.생산외주):
        return

    try:
        res = await page.evaluate(
            r"""() => {
                const norm = (s) => (s || '').replace(/\s+/g, '');
                const keywords = [
                    '천건이상조회', '1000건이상조회', '1,000건이상조회',
                    '전체조회', '전체보기', 'Showall', 'Loadall',
                ].map(norm);
                const isVisible = (el) => {
                    const s = getComputedStyle(el);
                    return s.display !== 'none' && s.visibility !== 'hidden' &&
                           el.offsetParent !== null;
                };
                const cands = [...document.querySelectorAll(
                    'button, a, [role="button"], [onclick]'
                )];
                const hit = cands.find(el => {
                    if (!isVisible(el)) return false;
                    const t = norm(el.innerText || el.textContent || '');
                    return keywords.some(k => t === k || t.startsWith(k));
                });
                if (hit) {
                    hit.click();
                    return { clicked: true, text: (hit.innerText || '').trim().slice(0, 40) };
                }
                return { clicked: false };
            }"""
        )
        if res.get("clicked"):
            print(f"[Ecount] 페이징 확장 버튼 클릭: '{res.get('text')}'")
            await asyncio.sleep(0.8)
    except Exception as e:
        print(f"[Ecount] 페이징 확장 예외(무시): {e}")


_EXCEL_BTN_PROBE_JS = r"""() => {
    const cands = [...document.querySelectorAll(
        'button, a, input[type="button"], [role="button"]'
    )];
    const visible = (el) => {
        const s = getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden' &&
               el.offsetParent !== null;
    };
    return cands.some(el => {
        if (!visible(el)) return false;
        const t = (el.innerText || el.value || '').trim();
        return t.includes('Excel') || t.includes('엑셀');
    });
}"""


async def _download_excel(
    page: Page,
    company_code: str = "unknown",
    menu_value: str = "unknown",
) -> bytes | None:
    """검색 완료 후 엑셀/CSV 다운로드 (메인·iframe 등 모든 프레임 탐색)."""
    # networkidle은 상한만 낮춤 (3s) — 실제로는 아래 엑셀 버튼 폴링으로 조기 탈출
    try:
        await page.wait_for_load_state("networkidle", timeout=3000)
    except Exception:
        pass

    excel_ready = False
    # 엑셀 버튼 가시화 폴링: 0.1s × 150회 = 최대 15s (기존과 동일 상한, 해상도 3배)
    for attempt in range(150):
        frames = list(page.frames)
        try:
            for fr in frames:
                try:
                    has_btn = await fr.evaluate(_EXCEL_BTN_PROBE_JS)
                    if has_btn:
                        excel_ready = True
                        if attempt > 0:
                            print(
                                f"[Ecount] 엑셀 버튼 가시화 ({attempt * 0.1:.1f}s 대기)"
                            )
                        break
                except Exception:
                    continue
            if excel_ready:
                break
        except Exception:
            pass
        await asyncio.sleep(0.1)

    if not excel_ready:
        print("[Ecount] [경고] 엑셀 버튼 15초 대기 후에도 DOM 미발견 — 그래도 탐색 시도")

    try:
        async with page.expect_download(timeout=60_000) as dl_info:
            clicked = False
            frames = list(page.frames)
            for fr in frames:
                for sel in EXCEL_BUTTON_SELECTORS:
                    try:
                        loc = fr.locator(sel).first
                        if await loc.count() > 0 and await loc.is_visible():
                            await loc.click(timeout=3000)
                            clicked = True
                            print(f"[Ecount] 엑셀 버튼 클릭 ({sel})")
                            break
                    except Exception:
                        continue
                if clicked:
                    break

            if not clicked:
                _click_js = r"""() => {
                    const cands = [...document.querySelectorAll(
                        'button, a, input[type="button"], [role="button"]'
                    )];
                    const visible = (el) => {
                        const s = getComputedStyle(el);
                        return s.display !== 'none' && s.visibility !== 'hidden' &&
                               el.offsetParent !== null;
                    };
                    let hit = cands.find(el => {
                        if (!visible(el)) return false;
                        const t = (el.innerText || el.value || '').trim();
                        return t.startsWith('Excel(') || t.startsWith('엑셀(');
                    });
                    if (hit) {
                        hit.click();
                        return { clicked: true, text: (hit.innerText || hit.value || '').trim() };
                    }
                    hit = cands.find(el => {
                        if (!visible(el)) return false;
                        const t = (el.innerText || el.value || '').trim();
                        return t.includes('Excel') || t.includes('엑셀');
                    });
                    if (hit) {
                        hit.click();
                        return { clicked: true, text: (hit.innerText || hit.value || '').trim() };
                    }
                    hit = cands.find(el => {
                        if (!visible(el)) return false;
                        const on = (el.getAttribute('onclick') || '').toLowerCase();
                        return on.includes('excel') || on.includes('xlsx');
                    });
                    if (hit) {
                        hit.click();
                        return { clicked: true, text: 'onclick:excel' };
                    }
                    return { clicked: false };
                }"""
                for fr in frames:
                    try:
                        found = await fr.evaluate(_click_js)
                        if found and found.get("clicked"):
                            clicked = True
                            print(
                                f"[Ecount] 엑셀 버튼 클릭(JS): {found.get('text')}"
                            )
                            break
                    except Exception:
                        continue

            if not clicked:
                print("[Ecount] [경고] 엑셀 버튼 탐색 실패 — 모든 전략 실패")
                return None

            # v2.8.5: "CSV 파일 형식 제공" 알림 polling (재고수불부 1만건+)
            # 최대 10초 대기, 발견 시 '확인' 클릭
            for attempt in range(33):
                try:
                    popped = await page.evaluate(
                        r"""() => {
                            const all = [...document.querySelectorAll('body *')];
                            const target = all.find(el => {
                                const t = (el.innerText || '').replace(/\s+/g, '');
                                return (t.includes('CSV파일형식') || t.includes('만건이상')) &&
                                       el.offsetParent !== null;
                            });
                            if (!target) return null;
                            let container = target;
                            for (let i = 0; i < 5 && container; i++) {
                                const btns = [...container.querySelectorAll('button, a')];
                                const ok = btns.find(
                                    b => (b.innerText || '').trim() === '확인'
                                );
                                if (ok) { ok.click(); return '확인'; }
                                container = container.parentElement;
                            }
                            return null;
                        }"""
                    )
                    if popped:
                        print(
                            f"[Ecount] CSV 제공 알림 "
                            f"({attempt * 0.3:.1f}s 대기) → '{popped}' 클릭"
                        )
                        break
                except Exception:
                    pass
                await asyncio.sleep(0.3)

        download: Download = await dl_info.value
        path = await download.path()
        if not path:
            return None
        with open(path, "rb") as f:
            data = f.read()
        print(f"[Ecount] 다운로드 완료: {len(data):,} bytes")

        # 원본 파일 보존
        try:
            save_dir = os.path.join(
                os.path.dirname(os.path.abspath(__file__)), "storage", "excel"
            )
            os.makedirs(save_dir, exist_ok=True)
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            # CSV는 확장자도 csv로
            ext = "csv" if data[:4] != b"PK\x03\x04" else "xlsx"
            save_path = os.path.join(
                save_dir, f"{company_code}_{menu_value}_{ts}.{ext}"
            )
            with open(save_path, "wb") as f:
                f.write(data)
            print(f"[Ecount] 원본 저장: {save_path}")
        except Exception as e:
            print(f"[Ecount] 원본 저장 실패(무시): {e}")

        return data

    except Exception as e:
        print(f"[Ecount] 엑셀 다운로드 실패: {e}")
        return None


def _extract_ec_req_sid(url: str) -> str:
    """URL 쿼리에서 ec_req_sid 추출."""
    from urllib.parse import urlparse, parse_qs

    try:
        return parse_qs(urlparse(url).query).get("ec_req_sid", [""])[0]
    except Exception:
        return ""


async def _try_enter_erp_from_login_shell(page: Page) -> None:
    """로그인 후 erp_login에 SID 없이 머무는 호스트(bb/ab 등)에서 ERP 진입까지 유도."""
    from urllib.parse import urljoin

    if _extract_ec_req_sid(page.url):
        return

    url = page.url
    if "erp_login" not in url and "/app.login/" not in url:
        return

    print("[Ecount] ERP 세션 SID 없음 → 리다이렉트·진입 링크 탐색")
    for _ in range(48):
        await asyncio.sleep(0.25)
        if _extract_ec_req_sid(page.url):
            print(f"[Ecount] SID 수신(대기): {page.url[:96]}...")
            return

    for sel in (
        'a[href*="ec_req_sid"]',
        'a[href*="/ec5/view/erp"]',
    ):
        try:
            loc = page.locator(sel).first
            if await loc.count() > 0:
                href = await loc.get_attribute("href")
                print(f"[Ecount] ERP 진입 링크 클릭: {sel} href={href!r}")
                await loc.click(timeout=8000)
                await page.wait_for_load_state("domcontentloaded", timeout=30000)
                for _ in range(40):
                    await asyncio.sleep(0.25)
                    if _extract_ec_req_sid(page.url):
                        print("[Ecount] SID 수신(메인 프레임 링크)")
                        return
                break
        except Exception:
            continue

    for frame in page.frames:
        if not frame.url or frame.url == "about:blank":
            continue
        try:
            href = await frame.evaluate(
                """() => {
                    const sels = ['a[href*="ec_req_sid"]', 'a[href*="/ec5/view/erp"]'];
                    for (const s of sels) {
                        const a = document.querySelector(s);
                        const h = a && a.getAttribute('href');
                        if (h && h.trim()) return h.trim();
                    }
                    return null;
                }"""
            )
            if href:
                base = frame.url if frame.url else page.url
                full = urljoin(base, href)
                print(f"[Ecount] iframe ERP 이동: {full[:120]}...")
                await page.goto(full, wait_until="domcontentloaded", timeout=30000)
                for _ in range(40):
                    await asyncio.sleep(0.25)
                    if _extract_ec_req_sid(page.url):
                        print("[Ecount] SID 수신(iframe)")
                        return
        except Exception:
            continue


# ──────────────────────────────────────────────
# 메인 크롤링 (자식 프로세스)
# ──────────────────────────────────────────────
async def _crawl_to_xlsx(
    menu: str,
    date_from: str,
    date_to: str,
    cookie_path: str,
    credentials: dict,
) -> bytes | None:
    menu_enum = EcountMenu(menu)

    async with async_playwright() as p:
        print(f"\n[Ecount] '{menu_enum.value}' 시작 (from {date_from})")

        context_kwargs: dict[str, Any] = {
            "user_agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            "locale": "ko-KR",
            "timezone_id": "Asia/Seoul",
            "accept_downloads": True,
        }
        if os.path.exists(cookie_path):
            context_kwargs["storage_state"] = cookie_path
            print(f"[Ecount] 쿠키 로드: {cookie_path}")

        headful_forced = os.getenv("ECOUNT_HEADFUL", "").strip() in ("1", "true", "True")
        if headful_forced:
            print("[Ecount] ECOUNT_HEADFUL=1 → 헤드풀 모드 강제")
        browser = await p.chromium.launch(headless=not headful_forced)
        context = await browser.new_context(**context_kwargs)
        page = await context.new_page()

        if not await _check_session(page):
            print("[Ecount] 세션 만료 → 재로그인")
            await browser.close()
            browser = await p.chromium.launch(headless=False)
            context = await browser.new_context(
                user_agent=context_kwargs["user_agent"],
                locale="ko-KR",
                timezone_id="Asia/Seoul",
                accept_downloads=True,
            )
            page = await context.new_page()
            if not await _login(page, credentials):
                if sys.stdin.isatty():
                    print("!" * 60)
                    print("[Ecount] 수동 로그인 후 엔터")
                    try:
                        input(">>> ")
                    except EOFError:
                        await browser.close()
                        raise RuntimeError("수동 입력 불가")
                else:
                    await browser.close()
                    raise RuntimeError(
                        f"자동 로그인 실패 — .env 확인: "
                        f"{company_env_prefix(credentials['company_code'])}_*"
                    )
            os.makedirs(os.path.dirname(cookie_path), exist_ok=True)
            await context.storage_state(path=cookie_path)

        try:
            nav = resolve_menu_navigation(menu_enum, credentials)
            prg_id = (nav.get("prg_id") or "").strip()
            if not prg_id:
                if menu_enum == EcountMenu.생산입고조회:
                    cc = str(credentials.get("company_code") or "")
                    pref = company_env_prefix(cc) or "ECOUNT_GL"
                    raise ValueError(
                        f"prg_id 미설정: {menu_enum.value} — ERP 주소창 #prgId= 확인 후 "
                        f".env에 {pref}_PRODUCTION_RECEIPT_PRG_ID=(값) 설정"
                    )
                raise ValueError(f"prg_id 미설정: {menu_enum.value}")

            current_url = page.url
            base_url = "/".join(current_url.split("/")[:3])
            ec_req_sid = _extract_ec_req_sid(current_url)

            if not ec_req_sid:
                await _try_enter_erp_from_login_shell(page)
                current_url = page.url
                base_url = "/".join(current_url.split("/")[:3])
                ec_req_sid = _extract_ec_req_sid(current_url)

            if not ec_req_sid:
                erp_main = f"{base_url}/ec5/view/erp"
                print(f"[Ecount] ec_req_sid 없음 → ERP 메인 경유: {erp_main}")
                try:
                    await page.goto(
                        erp_main, wait_until="domcontentloaded", timeout=30000
                    )
                    try:
                        await page.wait_for_url(
                            lambda u: "ec_req_sid=" in u
                            and _extract_ec_req_sid(u) != "",
                            timeout=15000,
                        )
                    except Exception:
                        pass
                    ec_req_sid = _extract_ec_req_sid(page.url)
                    base_url = "/".join(page.url.split("/")[:3])
                except Exception as e:
                    print(f"[Ecount] ERP 메인 진입 실패: {e}")

            if not ec_req_sid:
                try:
                    import time as _t

                    dbg_dir = os.path.join(
                        os.path.dirname(os.path.abspath(__file__)),
                        "storage",
                        "debug",
                    )
                    os.makedirs(dbg_dir, exist_ok=True)
                    dbg_path = os.path.join(
                        dbg_dir,
                        f"ec_sid_fail_{credentials.get('company_code', 'unknown')}"
                        f"_{int(_t.time())}.png",
                    )
                    await page.screenshot(path=dbg_path, full_page=True)
                    print(f"[Ecount] 디버그 스크린샷: {dbg_path}")
                except Exception:
                    pass

                raise RuntimeError(
                    f"ec_req_sid 획득 실패 — 현재 URL: {page.url} | "
                    "로그인은 성공했으나 ERP 세션 발급 단계 실패. "
                    "이카운트 로그인 후 ERP 진입 플로우가 바뀌었을 가능성. "
                    "storage/debug/ 디렉토리의 스크린샷 확인 또는 "
                    "ECOUNT_HEADFUL=1 로 실행하여 화면 관찰 필요."
                )
            print(f"[Ecount] ec_req_sid 획득: {ec_req_sid[:24]}... (base={base_url})")

            target_url = (
                f"{base_url}/ec5/view/erp"
                f"?w_flag=1&ec_req_sid={ec_req_sid}"
                f"#menuType={nav['menu_type']}&menuSeq={nav['menu_seq']}"
                f"&groupSeq={nav['group_seq']}&prgId={prg_id}&depth={nav['depth']}"
            )
            print(f"[Ecount] 이동: {target_url[:140]}...")
            await page.goto(target_url, wait_until="domcontentloaded", timeout=30000)

            # s_page 로드 폴링: 0.15s × 67회 = 최대 10s (기존 0.25s × 40회와 동일 상한, 해상도 향상)
            for attempt in range(67):
                sp = page.frame(name="s_page")
                if sp and sp.url and sp.url != "about:blank":
                    try:
                        if menu_enum == EcountMenu.생산입고조회:
                            has_content = await sp.evaluate(
                                """() => {
                                    const t = (document.body && document.body.innerText) || '';
                                    return t.includes('입고번호') || t.includes('생산입고')
                                        || t.includes('기준일자')
                                        || document.querySelectorAll('select').length >= 2;
                                }"""
                            )
                        else:
                            has_content = await sp.evaluate(
                                """() => document.querySelectorAll('select').length >= 3
                                    || (document.body?.innerText || '').includes('기준일자')"""
                            )
                        if has_content:
                            print(f"[Ecount] s_page 로드 ({attempt * 0.15:.1f}s)")
                            break
                    except Exception:
                        pass
                await asyncio.sleep(0.15)

            await asyncio.sleep(0.2)

            if menu_enum == EcountMenu.생산입고조회:
                print(
                    "[Ecount] 생산입고조회: 화면 기본값 유지 — 검색(F8)·페이징 확장 생략, 엑셀만"
                )
            else:
                await _trigger_erp_search_default_ui(page)
                await _expand_pagination_if_needed(page, menu_enum)

            xlsx_bytes = await _download_excel(
                page,
                company_code=str(credentials.get("company_code") or "unknown"),
                menu_value=menu_enum.value,
            )
            return xlsx_bytes

        except Exception as e:
            print(f"[Ecount] 크롤링 예외 ({menu_enum.value}): {e}")
            return None
        finally:
            await browser.close()


# ──────────────────────────────────────────────
# XLSX 정규화
# ──────────────────────────────────────────────
def _read_excel_no_header_bytes(xlsx_bytes: bytes) -> pd.DataFrame:
    """openpyxl이 손상/비표준 스타일 시트를 못 읽을 때 python_calamine 폴백."""
    try:
        return pd.read_excel(io.BytesIO(xlsx_bytes), header=None, engine="openpyxl")
    except (ValueError, KeyError, OSError) as e:
        msg = str(e).lower()
        if not any(
            sub in msg
            for sub in (
                "stylesheet",
                "unable to read workbook",
                "colors must be",
                "invalid xml",
            )
        ):
            raise
        try:
            from python_calamine import CalamineWorkbook
        except ImportError as ie:
            raise RuntimeError(
                "XLSX 스타일 오류 처리용 패키지 필요: pip install python-calamine"
            ) from ie
        print("[Ecount] [안내] openpyxl 스타일 오류 → python_calamine으로 시트 로드")
        bio = io.BytesIO(xlsx_bytes)
        wb = CalamineWorkbook.from_filelike(bio)
        try:
            sheet = wb.get_sheet_by_index(0)
            rows = sheet.to_python()
        finally:
            close_fn = getattr(wb, "close", None)
            if callable(close_fn):
                close_fn()
        return pd.DataFrame(rows)


def _dataframe_with_header_row(
    raw: pd.DataFrame, header_row_idx: int
) -> pd.DataFrame:
    """header=None으로 읽은 표에서 지정 행을 컬럼명으로 하는 DataFrame 생성."""
    ncols = raw.shape[1]
    col_names: list[str] = []
    for j in range(ncols):
        v = raw.iloc[header_row_idx, j]
        col_names.append(str(v).strip() if pd.notna(v) else f"col_{j}")
    body = raw.iloc[header_row_idx + 1 :].copy()
    body.columns = col_names
    body = body.reset_index(drop=True)
    return body


# 생산입고조회(지엘) — 엑셀 헤더(공백 무시) → Supabase 컬럼
# check_ecount.py 는 production_receipt 를 date_col=date_from 로만 집계(크롤 메타) → doc_date 미적재 시 기간이 CLI 기본값처럼 보임
PRODUCTION_RECEIPT_HEADER_MAP: dict[str, str] = {
    "입고번호": "receipt_no",
    "생산입고공장명": "factory_name",
    "받는창고명": "warehouse_name",
    "품목": "product_name",
    "수량": "qty",
    "작업지시서": "work_order",
}


def _normalize_production_receipt_xlsx(
    xlsx_bytes: bytes,
    company_code: str,
    date_from: str,
    date_to: str,
) -> list[dict]:
    """생산입고조회 XLSX → ecount_production_receipt 적재 행(날짜·검색 UI는 건드리지 않고 엑셀만)."""
    if not xlsx_bytes or xlsx_bytes[:4] != b"PK\x03\x04":
        print("[Ecount] [경고] 생산입고조회: XLSX가 아님")
        return []

    def _hn(s: object) -> str:
        return "".join(str(s).split())

    header_keys_norm = {_hn(k) for k in PRODUCTION_RECEIPT_HEADER_MAP}
    raw = _read_excel_no_header_bytes(xlsx_bytes)
    header_row_idx: int | None = None
    for i in range(min(len(raw), 30)):
        row_norm = {
            _hn(v) for v in raw.iloc[i].tolist() if pd.notna(v) and str(v).strip()
        }
        if len(row_norm & header_keys_norm) >= 2:
            header_row_idx = i
            break
    if header_row_idx is None:
        print("[Ecount] [경고] 생산입고조회: 헤더 행 탐지 실패")
        for j in range(min(5, len(raw))):
            print(f"  [{j}]", raw.iloc[j].tolist()[:8])
        return []

    df = _dataframe_with_header_row(raw, header_row_idx)
    df.columns = [str(c).strip() for c in df.columns]
    norm_to_actual = {_hn(c): c for c in df.columns}
    rename: dict[str, str] = {}
    for src, dst in PRODUCTION_RECEIPT_HEADER_MAP.items():
        nk = _hn(src)
        if nk in norm_to_actual:
            rename[norm_to_actual[nk]] = dst
    if not rename:
        print("[Ecount] [경고] 생산입고조회: 매칭 컬럼 없음")
        return []

    df = df[list(rename.keys())].rename(columns=rename)
    if "qty" in df.columns:
        df["qty"] = pd.to_numeric(
            df["qty"].astype(str).str.replace(",", "").str.strip(),
            errors="coerce",
        )
    df["company_code"] = company_code
    df["date_from"] = date_from
    df["date_to"] = date_to
    df["crawled_at"] = datetime.now().isoformat()

    if "receipt_no" in df.columns:
        s = df["receipt_no"].astype(str).str.strip()
        df = df[(s != "") & df["receipt_no"].notna()].copy()

    df = df.where(pd.notna(df), None)
    records = df.to_dict(orient="records")
    return records


def _sales_erp_value_is_empty(val: object) -> bool:
    """True면 DB NOT NULL erp_code 기준 비어 있음(numpy.nan·pd.NA·문자열 nan 포함)."""
    import math

    if val is None:
        return True
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
        return True
    if hasattr(val, "item"):
        try:
            return _sales_erp_value_is_empty(val.item())
        except Exception:
            return True
    try:
        if pd.isna(val):
            return True
    except (TypeError, ValueError):
        pass
    s = str(val).strip().lower()
    if s in ("", "nan", "none", "nat"):
        return True
    return False


def _normalize_xlsx(
    xlsx_bytes: bytes,
    company_code: str,
    menu: EcountMenu,
    allowed_erp_codes: set[str] | None,
    date_from: str,
    date_to: str,
    gl_sales_item_mapping: list[dict[str, str | None]] | None = None,
    mapping_stats_out: dict[str, object] | None = None,
) -> list[dict]:
    if not xlsx_bytes:
        return []

    # v2.8.3: CSV/XLSX 분기 — 매직바이트로 판정
    is_xlsx = xlsx_bytes[:4] == b"PK\x03\x04"
    if not is_xlsx and menu == EcountMenu.재고수불부:
        return _normalize_stock_ledger_csv(
            xlsx_bytes, company_code, date_from, date_to, allowed_erp_codes
        )
    if not is_xlsx:
        print(
            f"[Ecount] [경고] 비-XLSX 데이터 수신 ({company_code}/{menu.value}) — "
            "CSV 파서 미구현"
        )
        return []

    col_map = COLUMN_NORMALIZE.get(company_code, {}).get(menu.value)
    if not col_map:
        print(f"[Ecount] [경고] 정규화 맵 없음: {company_code}/{menu.value}")
        return []

    def _norm_header(s: object) -> str:
        return "".join(str(s).split())

    raw = _read_excel_no_header_bytes(xlsx_bytes)
    header_keys_norm = {_norm_header(k) for k in col_map.keys()}
    header_row_idx = None
    for i in range(min(len(raw), 20)):
        row_norm = {
            _norm_header(v) for v in raw.iloc[i].tolist() if pd.notna(v)
        }
        hits = len(row_norm & header_keys_norm)
        if hits >= 2:
            header_row_idx = i
            break

    if header_row_idx is None:
        print(
            f"[Ecount] [경고] 헤더 탐지 실패 ({company_code}/{menu.value}) — "
            f"상위 5행 샘플:"
        )
        for i in range(min(5, len(raw))):
            print(f"  [{i}]", raw.iloc[i].tolist()[:8])
        return []

    df = _dataframe_with_header_row(raw, header_row_idx)
    df.columns = [str(c).strip() for c in df.columns]

    norm_to_actual = {_norm_header(c): c for c in df.columns}
    available = {}
    missing = []
    for src_key, dst_col in col_map.items():
        nkey = _norm_header(src_key)
        if nkey in norm_to_actual:
            available[norm_to_actual[nkey]] = dst_col
        else:
            missing.append(src_key)
    if missing:
        print(f"[Ecount] [안내] 미매칭 헤더 ({company_code}/{menu.value}): {missing}")
    if not available:
        print(f"[Ecount] [경고] 매칭된 컬럼 없음 ({company_code}/{menu.value})")
        return []
    df = df[list(available.keys())].rename(columns=available)

    # doc_date 처리 — 실측 포맷 3종 순차 시도
    if "doc_date" in df.columns:
        s = df["doc_date"].astype(str).str.strip()
        extracted = s.str.extract(
            r"^(?P<date>.+?)\s*(?:-\s*(?P<no>\d+))?\s*$"
        )
        if extracted["no"].notna().any():
            df["doc_no"] = extracted["no"].where(extracted["no"].notna(), None)

        date_str = extracted["date"]
        d1 = pd.to_datetime(date_str, errors="coerce", format="%y/%m/%d")
        d2 = pd.to_datetime(date_str, errors="coerce", format="%Y/%m/%d")
        d3 = pd.to_datetime(date_str, errors="coerce", format="%Y-%m-%d")
        df["doc_date"] = d1.fillna(d2).fillna(d3)

        nat_count = int(df["doc_date"].isna().sum())
        if nat_count > 0:
            skipped = date_str[df["doc_date"].isna()].unique()[:5]
            print(
                f"[Ecount] doc_date 파싱 실패 {nat_count}행 "
                f"(소계/합계 추정). 샘플: {list(skipped)}"
            )

        df = df.dropna(subset=["doc_date"]).copy()
        df["doc_date"] = df["doc_date"].dt.strftime("%Y-%m-%d")

    for col in NUMERIC_COLS:
        if col in df.columns:
            df[col] = pd.to_numeric(
                df[col].astype(str).str.replace(",", "").str.strip(),
                errors="coerce",
            )

    # 지엘 판매: 품목코드 열 없음 → item_erp_mapping(erp_item_name·erp_spec)로 erp_code 부여
    if (
        menu == EcountMenu.판매현황
        and company_code == "gl"
        and gl_sales_item_mapping
        and "product_name" in df.columns
    ):
        df["erp_code"] = df["product_name"].map(
            lambda pn, _m=gl_sales_item_mapping: gl_sales_resolve_erp_from_item_mapping(
                str(pn or ""), _m
            )
        )
        ec_ser = df["erp_code"]
        ok_erp = ec_ser.notna() & (
            ec_ser.astype(str).str.strip().ne("")
            & ec_ser.astype(str).str.strip().str.lower().ne("nan")
        )
        if mapping_stats_out is not None:
            _gl_sales_fill_mapping_stats(df, mapping_stats_out)
        failed_n = int((~ok_erp).sum())
        if failed_n:
            print(
                f"[mapping] 매칭 실패 {failed_n}행 제외 "
                "(원인: item_erp_mapping에 없거나 표기 차이)"
            )
        if mapping_stats_out is not None:
            mst = mapping_stats_out
            print(
                f"[Ecount] gl/sales: 역매칭 성공 "
                f"{mst['matched']}/{mst['total_for_mapping']}행"
            )
        df = df.loc[ok_erp].copy()

    if allowed_erp_codes is not None and "erp_code" in df.columns:
        before = len(df)
        df["erp_code"] = df["erp_code"].astype(str).str.strip()
        df = df[df["erp_code"].isin(allowed_erp_codes)]
        print(
            f"[Ecount] 품목 필터 ({company_code}/{menu.value}): "
            f"{before} → {len(df)}행"
        )

    df["company_code"] = company_code
    df["date_from"] = date_from
    df["date_to"] = date_to

    # v2.9.2: sales 테이블 특수 처리
    if menu == EcountMenu.판매현황:
        # (a) erp_code 컬럼이 있는 기업만: 값이 비어 있는 행 제외(키 없음인 지엘 판매 등은 여기 해당 없음)
        if "erp_code" in df.columns:
            before = len(df)
            df = df[
                df["erp_code"].notna()
                & (df["erp_code"].astype(str).str.strip() != "")
                & (df["erp_code"].astype(str).str.strip().str.lower() != "nan")
            ]
            skipped = before - len(df)
            if skipped:
                print(f"[Ecount] sales: erp_code 비어 제외 {skipped}행")

        # (b) UNIQUE INDEX 키 기준 완전중복 제거
        unique_keys = [
            "company_code", "doc_date", "doc_no", "erp_code",
            "counterparty", "qty", "unit_price",
        ]
        avail = [k for k in unique_keys if k in df.columns]
        before = len(df)
        df = df.drop_duplicates(subset=avail, keep="first")
        dup = before - len(df)
        if dup:
            print(
                f"[Ecount] sales dedup: {before} → {len(df)}행 "
                f"({dup}개 완전중복 제거)"
            )

    df = df.where(pd.notna(df), None)
    records = df.to_dict(orient="records")

    for rec in records:
        for k, v in list(rec.items()):
            if hasattr(v, "item"):
                try:
                    rec[k] = v.item()
                except Exception:
                    rec[k] = None

    actual_range = ""
    if records:
        dates = sorted({r.get("doc_date") for r in records if r.get("doc_date")})
        if dates:
            actual_range = f", 실측 범위 {dates[0]} ~ {dates[-1]}"
    print(
        f"[Ecount] 정규화 완료 ({company_code}/{menu.value}): "
        f"{len(records)}행{actual_range}"
    )

    # 판매: 레코드에 erp_code 키가 있고 값만 비어 있으면 제외(지엘 E040207는 품목코드 열 없음 → 키 자체 없음, 해시·메모 필터 없음)
    if menu == EcountMenu.판매현황 and records and "erp_code" in records[0]:
        before_f = len(records)
        records = [
            r
            for r in records
            if not _sales_erp_value_is_empty(r.get("erp_code"))
        ]
        dropped = before_f - len(records)
        if dropped:
            print(f"[Ecount] sales: erp_code 비어 제외 {dropped}행")

    return records


# ──────────────────────────────────────────────
# 재고수불부 CSV 파서 (1만건+ 시 CSV로 제공)
# 구조: 품목별 섹션 반복
#   "회사명 : (주)지엘 / ... / 재고수불부 / 품목명 [단위] (erp_code)"
#   "일자", "거래처명", "적요", "입고수량", "출고수량", "재고수량", ""
#   ... 데이터 행 ...
#   "2026/04/19 오전 2:40:14"  ← 생성 타임스탬프
#   ""
# ──────────────────────────────────────────────
def _normalize_stock_ledger_csv(
    csv_bytes: bytes,
    company_code: str,
    date_from: str,
    date_to: str,
    allowed_erp_codes: set[str] | None,
) -> list[dict]:
    import csv
    import re
    import io as _io

    text = csv_bytes.decode("utf-8-sig", errors="replace")
    reader = csv.reader(_io.StringIO(text))

    section_re = re.compile(r"재고수불부\s*/\s*(.+?)\s*\[(.+?)\]\s*\((\S+)\)")

    current_erp = None
    current_name = None
    in_data = False
    records: list[dict] = []
    section_count = 0
    skipped_erp = 0

    def _clean(s: str) -> str:
        return s.replace("\t", "").strip() if s else ""

    for row in reader:
        if not row:
            in_data = False
            continue

        first = _clean(row[0])

        m = section_re.search(first)
        if m:
            current_name = m.group(1).strip()
            current_erp = m.group(3).strip()
            in_data = False
            section_count += 1
            continue

        if first == "일자":
            in_data = True
            continue

        if re.match(r"^\d{4}/\d{2}/\d{2}\s+(오전|오후)", first):
            in_data = False
            continue

        if not in_data or current_erp is None:
            continue

        vals = [_clean(c) for c in row]
        while len(vals) < 6:
            vals.append("")

        date_s = vals[0]
        counterparty = vals[1] or None
        memo = vals[2] or None
        inbound = vals[3]
        outbound = vals[4]

        if not date_s:
            continue

        if allowed_erp_codes is not None and current_erp not in allowed_erp_codes:
            skipped_erp += 1
            continue

        def _to_num(s: str) -> float | None:
            if not s:
                return None
            try:
                return float(s.replace(",", ""))
            except ValueError:
                return None

        records.append({
            "doc_date": date_s,
            "counterparty": counterparty,
            "memo": f"[품목: {current_erp} {current_name}] {memo or ''}".strip(),
            "inbound_qty": _to_num(inbound),
            "outbound_qty": _to_num(outbound),
            "company_code": company_code,
            "date_from": date_from,
            "date_to": date_to,
        })

    if records:
        df = pd.DataFrame(records)
        s = df["doc_date"].astype(str).str.strip()
        d1 = pd.to_datetime(s, errors="coerce", format="%Y/%m/%d")
        d2 = pd.to_datetime(s, errors="coerce", format="%y/%m/%d")
        df["doc_date"] = d1.fillna(d2)
        nat_count = int(df["doc_date"].isna().sum())
        if nat_count > 0:
            print(f"[Ecount] CSV doc_date 파싱 실패 {nat_count}행 drop")
            df = df.dropna(subset=["doc_date"]).copy()
        df["doc_date"] = df["doc_date"].dt.strftime("%Y-%m-%d")
        records = df.to_dict(orient="records")

    print(
        f"[Ecount] CSV 재고수불부 파싱 완료: "
        f"섹션 {section_count}개, 레코드 {len(records)}행"
        + (f", 품목 필터 제외 {skipped_erp}행" if skipped_erp else "")
    )
    return records


# ──────────────────────────────────────────────
# Supabase
# ──────────────────────────────────────────────
def _sanitize_records_for_json(records: list[dict]) -> list[dict]:
    """PostgreSQL JSON에 NaN이 들어가면 22P02 — float/NumPy NaN을 None으로 정리."""
    import math

    def _fix(v: object) -> object:
        if v is None:
            return None
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            return None
        if hasattr(v, "item"):
            try:
                return _fix(v.item())
            except Exception:
                return None
        try:
            if pd.isna(v):
                return None
        except (TypeError, ValueError):
            pass
        return v

    out: list[dict] = []
    for rec in records:
        out.append({str(k): _fix(val) for k, val in rec.items()})
    return out


def _doc_date_min_max_from_records(
    records: list[dict],
) -> tuple[str, str] | None:
    """INSERT 대상 records에서 doc_date(YYYY-MM-DD)만 모아 min/max. 정리(sanitize) 전·후 모두 동일 키."""
    import math

    parts: list[str] = []
    for r in records:
        d = r.get("doc_date")
        if d is None:
            continue
        if isinstance(d, float) and (math.isnan(d) or math.isinf(d)):
            continue
        if hasattr(d, "strftime"):
            try:
                parts.append(d.strftime("%Y-%m-%d"))
            except Exception:
                continue
            continue
        s = str(d).strip()[:10]
        if not s or s.lower() in ("nan", "none", "nat"):
            continue
        if len(s) >= 10 and s[4] == "-" and s[7] == "-":
            parts.append(s[:10])
    if not parts:
        return None
    return min(parts), max(parts)


def fetch_allowed_erp_codes(
    supabase: Client, company_code: str
) -> set[str]:
    try:
        res = (
            supabase.table("item_erp_mapping")
            .select("erp_code")
            .eq("erp_system", company_code)
            .not_.is_("erp_code", "null")
            .execute()
        )
        codes = {
            str(r["erp_code"]).strip()
            for r in (res.data or [])
            if r.get("erp_code")
        }
        print(f"[Ecount] 허용 품목코드 ({company_code}): {len(codes)}개")
        return codes
    except Exception as e:
        print(f"[Ecount] item_erp_mapping 조회 실패: {e}")
        return set()


def fetch_item_erp_mapping_for_gl_sales(
    supabase: Client, company_code: str
) -> list[dict[str, str | None]]:
    """지엘 판매 역매칭용—verified·ai_suggested 우선; mapping_status 컬럼 없으면 폴백 조회."""

    def rows_from_rows(
        raw: list[dict[str, object]],
        *,
        drop_rejected: bool,
    ) -> list[dict[str, str | None]]:
        rows_out: list[dict[str, str | None]] = []
        seen_keys: set[tuple[str, str | None, str | None]] = set()
        for r in raw:
            if not r.get("erp_code"):
                continue
            if drop_rejected and r.get("mapping_status") == "rejected":
                continue
            ec = str(r["erp_code"]).strip()
            en = (
                str(r["erp_item_name"]).strip()
                if r.get("erp_item_name")
                else None
            )
            es = (
                str(r["erp_spec"]).strip()
                if r.get("erp_spec")
                else None
            )
            dedup_k = (ec, en, es)
            if dedup_k in seen_keys:
                continue
            seen_keys.add(dedup_k)
            rows_out.append(
                {
                    "erp_code": ec,
                    "erp_item_name": en,
                    "erp_spec": es,
                }
            )
        rows_out.sort(key=lambda x: str(x.get("erp_code") or ""))
        return rows_out

    try:
        res = (
            supabase.table("item_erp_mapping")
            .select("erp_code, erp_item_name, erp_spec, mapping_status")
            .eq("erp_system", company_code)
            .in_("mapping_status", ["verified", "ai_suggested"])
            .not_.is_("erp_code", "null")
            .execute()
        )
        rows = rows_from_rows(res.data or [], drop_rejected=False)
        print(
            f"[Ecount] item_erp_mapping 역매칭 행 ({company_code}, verified·ai_suggested): "
            f"{len(rows)}개"
        )
        return rows
    except Exception as e:
        msg = str(e)
        if "42703" not in msg and "mapping_status" not in msg.lower():
            print(f"[Ecount] item_erp_mapping(이름) 조회 실패: {e}")
            return []
        print(
            "[Ecount] mapping_status 컬럼 없음 — erp_code·품목명·규격만 재조회"
        )
        try:
            res_fb = (
                supabase.table("item_erp_mapping")
                .select("erp_code, erp_item_name, erp_spec")
                .eq("erp_system", company_code)
                .not_.is_("erp_code", "null")
                .execute()
            )
        except Exception as e2:
            print(f"[Ecount] item_erp_mapping 폴백 조회 실패: {e2}")
            return []
        rows_fb = rows_from_rows(res_fb.data or [], drop_rejected=False)
        print(
            f"[Ecount] item_erp_mapping 역매칭 행 ({company_code}, 폴백): {len(rows_fb)}개"
        )
        return rows_fb


def _collapse_ws(s: str) -> str:
    t = unicodedata.normalize("NFKC", str(s))
    return " ".join(t.split())


def _compact_no_ws(s: str) -> str:
    """품명 중간 오타 공백(하루온이 지페인 ↔ 하루온이지페인) 보정용 비교 문자열."""
    t = unicodedata.normalize("NFKC", str(s))
    return "".join(t.split())


def gl_sales_resolve_erp_from_item_mapping(
    product_name: str,
    rows: list[dict[str, str | None]],
) -> str | None:
    """품명 및 규격 셀 → item_erp_mapping 기준 GL 품목코드(실제 ERP 코드)."""
    raw = str(product_name or "").strip()
    if not raw or not rows:
        return None
    pn = _collapse_ws(raw)
    pn_compact = _compact_no_ws(raw)

    def pick_from_scored(candidates: list[tuple[int, str]]) -> str | None:
        if not candidates:
            return None
        candidates.sort(key=lambda t: (-t[0], t[1]))
        return candidates[0][1]

    tier_a: list[tuple[int, str]] = []
    for row in rows:
        code = row.get("erp_code")
        if not code:
            continue
        name = _collapse_ws(str(row.get("erp_item_name") or ""))
        spec = str(row.get("erp_spec") or "").strip()
        if spec:
            composite = _collapse_ws(f"{name} [{spec}]")
        else:
            composite = name
        if not composite:
            continue
        if pn == composite:
            tier_a.append((50_000 + len(composite), code))
            continue
        composite_c = _compact_no_ws(composite)
        if pn_compact == composite_c:
            tier_a.append((49_500 + len(composite_c), code))

    hit = pick_from_scored(tier_a)
    if hit:
        return hit

    m_br = re.search(r"\[([^\]]+)\]\s*$", raw)
    excel_base = _collapse_ws(raw[: m_br.start()] if m_br else raw)
    excel_spec = m_br.group(1).strip() if m_br else None
    excel_bc = _compact_no_ws(excel_base)

    tier_b: list[tuple[int, str]] = []
    tier_c: list[tuple[int, str]] = []
    for row in rows:
        code = row.get("erp_code")
        if not code:
            continue
        name = _collapse_ws(str(row.get("erp_item_name") or ""))
        name_c = _compact_no_ws(name)
        spec = str(row.get("erp_spec") or "").strip()
        if not name:
            continue
        base_eq = excel_base == name or excel_bc == name_c
        if base_eq and spec and excel_spec is not None and excel_spec == spec:
            tier_b.append((40_000 + len(name), code))
        elif base_eq and not spec and excel_spec is None:
            tier_b.append((35_000 + len(name), code))

        min_pre = 6
        pre_a = excel_base.startswith(name) and len(name) >= 2
        pre_b = (
            len(name_c) >= min_pre
            and excel_bc.startswith(name_c)
            and excel_bc != name_c
        )
        if (pre_a or pre_b) and spec and excel_spec is not None and excel_spec == spec:
            tier_c.append((20_000 + len(name), code))
        if (pre_a or pre_b) and not spec and excel_spec is None:
            tier_c.append((10_000 + len(name), code))

    hit = pick_from_scored(tier_b)
    if hit:
        return hit
    return pick_from_scored(tier_c)


def _gl_sales_fill_mapping_stats(
    df_in: pd.DataFrame,
    mapping_stats_out: dict[str, object],
) -> None:
    """역매칭 직후 df 기준으로 dry-run·로그용 통계 기록."""
    n = len(df_in)
    if "erp_code" not in df_in.columns or "product_name" not in df_in.columns:
        mapping_stats_out["total_for_mapping"] = n
        mapping_stats_out["matched"] = 0
        mapping_stats_out["failed_samples"] = []
        mapping_stats_out["erp_top10"] = {}
        return
    ec = df_in["erp_code"]
    ok = ec.notna() & (
        ec.astype(str).str.strip().ne("")
        & ec.astype(str).str.strip().str.lower().ne("nan")
    )
    matched_ct = int(ok.sum())
    mapping_stats_out["total_for_mapping"] = n
    mapping_stats_out["matched"] = matched_ct
    failed_df = df_in.loc[~ok, "product_name"]
    uniq_fail = (
        failed_df.dropna().astype(str).str.strip().unique().tolist()
    )
    mapping_stats_out["failed_samples"] = uniq_fail[:10]
    top = df_in.loc[ok, "erp_code"].astype(str).str.strip().value_counts().head(10)
    mapping_stats_out["erp_top10"] = {str(k): int(v) for k, v in top.items()}


def _print_gl_sales_mapping_dry_run_report(stats: dict[str, object]) -> None:
    """--dry-run-mapping 전용 요약 출력."""
    total = int(stats.get("total_for_mapping", 0) or 0)
    matched = int(stats.get("matched", 0) or 0)
    pct = (100.0 * matched / total) if total else 0.0
    print("\n[mapping dry-run]")
    print(f"  총 행수:             {total}행")
    print(f"  매칭 성공:           {matched}행 ({pct:.1f}%)")
    samples = list(stats.get("failed_samples") or [])
    print(f"  매칭 실패 샘플 10건: {samples}")
    top = stats.get("erp_top10") or {}
    print("  매칭된 erp_code 분포: 상위 10개")
    for k, v in list(top.items())[:10]:
        print(f"    {k}: {v}행")


def _qty_normalize_key(val: object) -> str:
    """수량 비교용 정규화 — 변경 이유: 유니크 키 qty와 배치 내 중복 판별 일치"""
    import math

    if val is None:
        return ""
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
        return ""
    try:
        return str(round(float(val), 6))
    except (TypeError, ValueError):
        return str(val).strip()


def _line_identity_for_dedupe(r: dict) -> str:
    """전표/라인 식별 — 변경 이유: doc_no 없는 메뉴는 receipt_no·work_order 등으로 구분"""
    for k in ("doc_no", "receipt_no", "work_order", "memo"):
        v = r.get(k)
        if v is None:
            continue
        s = str(v).strip()
        if s and s.lower() not in ("nan", "none", "nat"):
            return s
    return ""


_ECOUNT_TABLES_WIDE_FINGERPRINT = frozenset(
    {"ecount_purchase", "ecount_sales", "ecount_production_outsource"}
)


def _ecount_row_fingerprint(r: dict, table_name: str) -> tuple[str, ...]:
    """INSERT 유니크(전표·품목·수량 등)와 맞춘 행 지문 — 변경 이유: 동일 전표·동일 품목 라인 구분"""
    dd = r.get("doc_date")
    ds = ""
    if dd is not None:
        ds = str(dd)[:10] if len(str(dd)) >= 10 else str(dd).strip()
    cc = str(r.get("company_code") or "")
    dn = str(r.get("doc_no") or "").strip()
    ec = str(r.get("erp_code") or "").strip()
    qv = _qty_normalize_key(r.get("qty"))
    cp = str(r.get("counterparty") or "").strip()[:120]

    if table_name in _ECOUNT_TABLES_WIDE_FINGERPRINT:
        memo = str(r.get("memo") or "").strip()[:400]
        pn = str(r.get("product_name") or "").strip()[:200]
        up = _qty_normalize_key(r.get("unit_price"))
        vat = _qty_normalize_key(r.get("vat_amount"))
        sa = _qty_normalize_key(r.get("supply_amount"))
        ta = _qty_normalize_key(r.get("total_amount"))
        return (cc, ds, dn, ec, qv, memo, pn, up, vat, sa, ta, cp)

    li = _line_identity_for_dedupe(r)
    return (cc, ds, li, ec, qv, cp)


def _filter_ecount_sales_erp_required(records: list[dict]) -> list[dict]:
    """erp_code NOT NULL 스키마 충족 — 변경 이유: 역매칭 실패 행이 sanitize 이후에도 빠지지 않은 경우 방지"""
    out: list[dict] = []
    for r in records:
        ec = r.get("erp_code")
        s = str(ec).strip() if ec is not None else ""
        if s and s.lower() not in ("nan", "none", "nat"):
            out.append(r)
    dropped = len(records) - len(out)
    if dropped:
        print(f"[Supabase] ecount_sales erp_code 없음 제외: {dropped}행")
    return out


def _dedupe_ecount_records_for_insert(
    records: list[dict], table_name: str
) -> list[dict]:
    """INSERT 배치 내 동일 라인 중복 제거 — 변경 이유: PostgreSQL 23505·동일 행 중복 삽입 방지"""
    seen: set[tuple[str, ...]] = set()
    out: list[dict] = []
    for r in records:
        key = _ecount_row_fingerprint(r, table_name)
        if key in seen:
            continue
        seen.add(key)
        out.append(r)
    if len(out) != len(records):
        print(f"[Supabase] 배치 내 중복 행 제거: {len(records)} → {len(out)}")
    return out


def _tables_with_doc_no_cleanup() -> frozenset[str]:
    """doc_no로 추가 DELETE 하는 ecount_* 테이블 — 변경 이유: 재고수불 등 doc_no 없음 스킵"""
    return frozenset(
        {
            "ecount_purchase",
            "ecount_production_outsource",
            "ecount_sales",
        }
    )


def _delete_existing_rows_for_batch_doc_keys(
    supabase: Client,
    table_name: str,
    company_code: str,
    records: list[dict],
) -> int:
    """배치에 등장하는 (doc_date, doc_no) 조합만 추가 삭제 — 변경 이유: doc_no 단독 삭제는 타 일자 전표까지 지울 수 있어 조합만 사용"""
    if table_name not in _tables_with_doc_no_cleanup():
        return 0
    pairs: list[tuple[str, str]] = []
    for r in records:
        dd = r.get("doc_date")
        if dd is None:
            continue
        ds = str(dd)[:10] if len(str(dd)) >= 10 else ""
        if len(ds) < 10 or ds[4] != "-" or ds[7] != "-":
            continue
        dn = r.get("doc_no")
        if dn is None:
            continue
        sdn = str(dn).strip()
        if not sdn or sdn.lower() in ("nan", "none", "nat"):
            continue
        pairs.append((ds, sdn))
    if not pairs:
        return 0
    uniq_pairs = sorted(set(pairs))
    removed = 0
    for ds, sdn in uniq_pairs:
        try:
            del_res = (
                supabase.table(table_name)
                .delete(count="exact")
                .eq("company_code", company_code)
                .eq("doc_date", ds)
                .eq("doc_no", sdn)
                .execute()
            )
            removed += getattr(del_res, "count", 0) or 0
        except Exception as ex:
            logger.warning(
                "supabase_doc_key_cleanup_failed",
                table=table_name,
                doc_date=ds,
                error=str(ex),
            )
    if removed:
        print(
            f"[Supabase] {table_name} 추가 삭제(doc_date+doc_no 조합·이번 배치 기준): {removed}행"
        )
    return removed


def save_to_supabase_replace(
    supabase: Client,
    table_name: str,
    records: list[dict],
    company_code: str,
) -> dict:
    if not records:
        return {"inserted": 0, "deleted": 0, "error": None}

    if table_name == "ecount_sales":
        records = _filter_ecount_sales_erp_required(records)
    if not records:
        return {
            "inserted": 0,
            "deleted": 0,
            "error": "ecount_sales: 삽입 가능 행 없음(erp_code 부재)",
        }

    bounds = _doc_date_min_max_from_records(records)
    if bounds is None:
        err = (
            f"{table_name}: 유효한 doc_date가 레코드에 없어 DELETE 범위를 정할 수 없음"
        )
        logger.error("supabase_delete_skipped", table=table_name, reason=err)
        return {"inserted": 0, "deleted": 0, "error": err}

    d_lo, d_hi = bounds
    deleted = 0
    try:
        del_res = (
            supabase.table(table_name)
            .delete(count="exact")
            .eq("company_code", company_code)
            .gte("doc_date", d_lo)
            .lte("doc_date", d_hi)
            .execute()
        )
        deleted = getattr(del_res, "count", 0) or 0
        print(
            f"[Supabase] {table_name} 기존 삭제(doc_date {d_lo} ~ {d_hi}, 실측 범위): "
            f"{deleted}행"
        )
    except Exception as e:
        logger.error("supabase_delete_failed", table=table_name, error=str(e))
        return {"inserted": 0, "deleted": 0, "error": f"delete: {e}"}

    extra_del = _delete_existing_rows_for_batch_doc_keys(
        supabase, table_name, company_code, records
    )
    deleted += extra_del

    records = _sanitize_records_for_json(records)
    records = _dedupe_ecount_records_for_insert(records, table_name)

    BATCH = 500
    total = 0
    try:
        for i in range(0, len(records), BATCH):
            batch = records[i : i + BATCH]
            supabase.table(table_name).insert(batch).execute()
            total += len(batch)
            print(f"[Supabase] {table_name}: {total}/{len(records)}")
        return {"inserted": total, "deleted": deleted, "error": None}
    except Exception as e:
        logger.error("supabase_insert_failed", table=table_name, error=str(e))
        return {"inserted": total, "deleted": deleted, "error": f"insert: {e}"}


def save_to_supabase_replace_period_meta(
    supabase: Client,
    table_name: str,
    records: list[dict],
    company_code: str,
    date_from: str,
    date_to: str,
) -> dict:
    """doc_date 기준이 아닌, 크롤 메타 date_from·date_to 일치 행만 삭제 후 insert (생산입고 등)."""
    if not records:
        return {"inserted": 0, "deleted": 0, "error": None}

    deleted = 0
    try:
        del_res = (
            supabase.table(table_name)
            .delete(count="exact")
            .eq("company_code", company_code)
            .eq("date_from", date_from)
            .eq("date_to", date_to)
            .execute()
        )
        deleted = getattr(del_res, "count", 0) or 0
        print(f"[Supabase] {table_name} 동일 조회기간 삭제: {deleted}행")
    except Exception as e:
        logger.error("supabase_delete_failed", table=table_name, error=str(e))
        return {"inserted": 0, "deleted": 0, "error": f"delete: {e}"}

    records = _sanitize_records_for_json(records)
    records = _dedupe_ecount_records_for_insert(records, table_name)

    BATCH = 500
    total = 0
    try:
        for i in range(0, len(records), BATCH):
            batch = records[i : i + BATCH]
            supabase.table(table_name).insert(batch).execute()
            total += len(batch)
            print(f"[Supabase] {table_name}: {total}/{len(records)}")
        return {"inserted": total, "deleted": deleted, "error": None}
    except Exception as e:
        logger.error("supabase_insert_failed", table=table_name, error=str(e))
        return {"inserted": total, "deleted": deleted, "error": f"insert: {e}"}


# ──────────────────────────────────────────────
# 크롤러 클래스
# ──────────────────────────────────────────────
class EcountCrawler:
    def __init__(self, company_code: str | EcountCompanyCode | None = None) -> None:
        normalized = normalize_company_code(company_code)
        if company_env_prefix(normalized) is None:
            raise ValueError(
                f"알 수 없는 기업 코드: {company_code!r} — "
                f"{[co.value for co, _, _ in COMPANY_REGISTRY]} 중 하나"
            )
        bundle = credentials_bundle_for_company(normalized)
        if bundle is None:
            pref = company_env_prefix(normalized)
            raise ValueError(
                f"기업 '{normalized}' 자격증명 없음 — "
                f"{pref}_COM_CODE / USER_ID / USER_PW"
            )
        self.company_code = normalized
        self.credentials: dict[str, Any] = bundle
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
        dry_run_mapping: bool = False,
    ) -> dict:
        import concurrent.futures

        if dry_run_mapping:
            if self.company_code != "gl" or menu != EcountMenu.판매현황:
                return {
                    "menu": menu.value,
                    "company_code": self.company_code,
                    "rows": 0,
                    "inserted": 0,
                    "deleted": 0,
                    "error": "--dry-run-mapping 은 --company gl --menu sales 전용",
                    "mapping_stats": None,
                }
            if self.supabase is None:
                return {
                    "menu": menu.value,
                    "company_code": self.company_code,
                    "rows": 0,
                    "inserted": 0,
                    "deleted": 0,
                    "error": "dry-run 에는 Supabase(SERVICE_ROLE) 연결 필요",
                    "mapping_stats": None,
                }

        if not date_from:
            date_from = "2024-01-01"
        if not date_to:
            date_to = datetime.now().strftime("%Y-%m-%d")

        if menu not in COMPANY_MENUS.get(self.company_code, []):
            return {
                "menu": menu.value,
                "company_code": self.company_code,
                "rows": 0,
                "inserted": 0,
                "deleted": 0,
                "error": f"{self.company_code} 는 {menu.value} 미지원",
                "mapping_stats": None,
            }

        print(f"\n{'=' * 50}")
        print(
            f"[EcountCrawler] {self.credentials['company_label']} "
            f"({self.company_code}) | {menu.value} | (ERP 화면 기본 기간)"
        )
        print(f"{'=' * 50}")

        loop = asyncio.get_event_loop()
        with concurrent.futures.ProcessPoolExecutor(max_workers=1) as ex:
            xlsx_bytes = await loop.run_in_executor(
                ex,
                _run_in_new_process,
                menu.value,
                date_from,
                date_to,
                self.cookie_path,
                self.credentials,
            )

        if not xlsx_bytes:
            return {
                "menu": menu.value,
                "company_code": self.company_code,
                "rows": 0,
                "inserted": 0,
                "deleted": 0,
                "error": "엑셀 다운로드 실패",
                "mapping_stats": None,
            }

        mapping_stats: dict[str, object] | None = None
        if menu == EcountMenu.생산입고조회:
            records = _normalize_production_receipt_xlsx(
                xlsx_bytes, self.company_code, date_from, date_to
            )
        else:
            allowed: set[str] | None = None
            gl_sales_map: list[dict[str, str | None]] | None = None
            stats_buf: dict[str, object] = {}
            if self.supabase is not None:
                if (
                    self.company_code == "gl"
                    and menu == EcountMenu.판매현황
                ):
                    gl_sales_map = fetch_item_erp_mapping_for_gl_sales(
                        self.supabase, self.company_code
                    )
                    if gl_sales_map:
                        allowed = {
                            str(r["erp_code"]).strip()
                            for r in gl_sales_map
                            if r.get("erp_code")
                        }
                    else:
                        gl_sales_map = None
                        allowed = fetch_allowed_erp_codes(
                            self.supabase, self.company_code
                        )
                else:
                    allowed = fetch_allowed_erp_codes(
                        self.supabase, self.company_code
                    )

            pass_gl_sales_stats = (
                self.company_code == "gl"
                and menu == EcountMenu.판매현황
                and bool(gl_sales_map)
            )
            if pass_gl_sales_stats:
                mapping_stats = stats_buf

            records = _normalize_xlsx(
                xlsx_bytes,
                self.company_code,
                menu,
                allowed if allowed else None,
                date_from,
                date_to,
                gl_sales_map,
                stats_buf if pass_gl_sales_stats else None,
            )

        result: dict = {
            "menu": menu.value,
            "company_code": self.company_code,
            "rows": len(records),
            "inserted": 0,
            "deleted": 0,
            "error": None,
            "mapping_stats": mapping_stats,
        }

        if dry_run_mapping and menu == EcountMenu.판매현황:
            if mapping_stats is None:
                result["error"] = (
                    "역매칭 통계 없음 — Supabase item_erp_mapping 또는 "
                    "동일 기간 엑셀 확인"
                )
                return result
            st = mapping_stats
            _print_gl_sales_mapping_dry_run_report(st)
            tot = int(st.get("total_for_mapping", 0) or 0)
            if tot == 0:
                result["error"] = (
                    "역매칭 대상(정규화 후) 0행 — 엑셀·기간·doc_date 확인"
                )
                return result
            mat = int(st.get("matched", 0) or 0)
            rate = 100.0 * mat / tot
            if rate < GL_SALES_MAPPING_MIN_OK_PCT:
                result["error"] = (
                    f"역매칭률 {rate:.1f}% < {GL_SALES_MAPPING_MIN_OK_PCT:.0f}% — "
                    "DB INSERT 생략(의심 데이터 방지)"
                )
                return result
            return result

        do_save = save_to_db and records and not dry_run_mapping
        if do_save:
            if self.supabase is None:
                result["error"] = "SUPABASE_URL/KEY 미설정"
                return result
            table = TABLE_MAP[menu]
            if menu == EcountMenu.생산입고조회:
                save_res = save_to_supabase_replace_period_meta(
                    self.supabase,
                    table,
                    records,
                    self.company_code,
                    date_from,
                    date_to,
                )
            else:
                save_res = save_to_supabase_replace(
                    self.supabase,
                    table,
                    records,
                    self.company_code,
                )
            result["inserted"] = save_res["inserted"]
            result["deleted"] = save_res["deleted"]
            result["error"] = save_res["error"]

        return result


# ──────────────────────────────────────────────
# 전사 오케스트레이션
# ──────────────────────────────────────────────
async def crawl_all_companies(
    date_from: str | None = None,
    date_to: str | None = None,
    company_codes: list[str] | None = None,
    save_to_db: bool = True,
) -> list[dict]:
    if not date_from:
        date_from = "2024-01-01"
    if not date_to:
        date_to = datetime.now().strftime("%Y-%m-%d")

    targets = company_codes or list_configured_company_codes()
    if not targets:
        print("[Ecount] 자격증명 있는 기업 없음")
        return []

    print(f"[Ecount] 기업 병렬 크롤링: {targets}")

    async def _one_company(code: str) -> list[dict]:
        try:
            crawler = EcountCrawler(company_code=code)
        except ValueError as e:
            print(f"[Ecount] {code} 스킵: {e}")
            return []

        out: list[dict] = []
        for menu in COMPANY_MENUS.get(code, []):
            try:
                r = await crawler.crawl_and_save(
                    menu, date_from, date_to, save_to_db=save_to_db
                )
                out.append(r)
            except Exception as e:
                out.append(
                    {
                        "menu": menu.value,
                        "company_code": code,
                        "rows": 0,
                        "inserted": 0,
                        "deleted": 0,
                        "error": str(e),
                    }
                )
            await asyncio.sleep(random.uniform(0.8, 1.4))
        return out

    batches = await asyncio.gather(
        *[_one_company(c) for c in targets], return_exceptions=False
    )
    flat = [r for batch in batches for r in batch]
    return flat


# ──────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────
if __name__ == "__main__":
    import argparse

    known_codes = [co.value for co, _, _ in COMPANY_REGISTRY]
    parser = argparse.ArgumentParser(
        description="Ecount ERP Crawler (구매·생산외주·판매·재고수불부·생산입고)"
    )
    parser.add_argument(
        "--menu",
        default="all",
        choices=[m.value for m in EcountMenu] + ["all"],
        help="크롤 대상 메뉴",
    )
    parser.add_argument(
        "--company",
        default="all",
        help=f"기업 코드 ({', '.join(known_codes)}) 또는 all",
    )
    parser.add_argument("--from", dest="date_from", default="2024-01-01")
    parser.add_argument(
        "--to", dest="date_to", default=datetime.now().strftime("%Y-%m-%d")
    )
    parser.add_argument("--no-db", action="store_true", help="DB 저장 스킵")
    parser.add_argument(
        "--dry-run-mapping",
        action="store_true",
        help="gl/sales만: 역매칭 검증 출력 후 INSERT 생략, 매칭률 90%% 미만이면 오류 종료",
    )
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()

    if args.debug:
        os.environ["ECOUNT_DEBUG"] = "1"

    async def _main() -> None:
        if args.company.strip().lower() == "all":
            targets = None
        else:
            targets = [normalize_company_code(args.company)]

        if args.menu == "all":
            results = await crawl_all_companies(
                date_from=args.date_from,
                date_to=args.date_to,
                company_codes=targets,
                save_to_db=not args.no_db,
            )
        else:
            menu_enum = EcountMenu(args.menu)
            use_targets = targets or list_configured_company_codes()

            async def _one(code: str) -> dict:
                crawler = EcountCrawler(company_code=code)
                return await crawler.crawl_and_save(
                    menu_enum,
                    args.date_from,
                    args.date_to,
                    save_to_db=not args.no_db,
                    dry_run_mapping=args.dry_run_mapping,
                )

            results = await asyncio.gather(*[_one(c) for c in use_targets])

        print(f"\n{'#' * 50}")
        print("[Ecount] 전체 결과")
        print(f"{'#' * 50}")
        exit_err = False
        for r in results:
            print(
                f"  {r['company_code']:>10} | {r['menu']:>12} | "
                f"rows={r['rows']:>5} | del={r.get('deleted', 0):>5} | "
                f"ins={r['inserted']:>5} | err={r['error']}"
            )
            if r.get("error"):
                exit_err = True
        if exit_err:
            sys.exit(1)

    asyncio.run(_main())
