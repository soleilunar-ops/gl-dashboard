"""
Ecount 런타임 브라우저 크롤링 모듈.
변경 이유: Playwright 기반 크롤링 로직을 분리해 런타임 코어 파일 길이를 줄입니다.
"""

from __future__ import annotations

import asyncio
import os
import random
import sys
from datetime import datetime

from playwright.async_api import Download, Frame, Page, async_playwright

from ecount_runtime_company import EcountMenu, remove_cookie_file, resolve_menu_navigation

_EXCEL_BUILTIN_SELECTORS: list[str] = [
    'button:has-text("Excel(화면)")',
    'button:has-text("Excel(전체)")',
    'a:has-text("Excel(화면)")',
    'a:has-text("Excel(전체)")',
    'button:has-text("엑셀")',
    'a:has-text("엑셀")',
    'button:has-text("Excel")',
    '[title*="엑셀"]',
    '[title*="Excel"]',
    '[data-cid*="excel" i]',
    '[data-cid*="Excel"]',
    "#excel",
    "#btnExcel",
]

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


def excel_selectors_for_download() -> list[str]:
    """사용자 지정 셀렉터를 앞에 붙여 먼저 시도(버튼 위치가 특이할 때)."""
    raw = (os.getenv("ECOUNT_EXCEL_EXTRA_SELECTORS") or "").strip()
    extra = [s.strip() for s in raw.split(",") if s.strip()]
    return extra + _EXCEL_BUILTIN_SELECTORS


def should_save_raw_excel_file() -> bool:
    """
    변경 이유: 원본 엑셀 파일 저장 여부를 환경변수로 제어해 불필요한 파일 누적을 막습니다.
    기본값은 비활성화(OFF)입니다.
    """
    raw = (os.getenv("ECOUNT_SAVE_RAW_EXCEL") or "").strip().lower()
    return raw in {"1", "true", "y", "yes", "on"}


async def login(page: Page, credentials: dict) -> bool:
    """
    이카운트 로그인 수행.
    성공 시 True, 실패 시 False 반환.
    """
    try:
        await page.goto(
            "https://login.ecount.com/Login/?lan_type=ko-KR/",
            wait_until="domcontentloaded",
            timeout=30000,
        )
        await asyncio.sleep(random.uniform(0.4, 0.8))

        login_scope: Page | Frame = page
        found_form = False
        for _ in range(20):
            await dismiss_login_overlay(page)
            for scope in [page, *page.frames]:
                try:
                    loc = scope.locator("#com_code").first
                    if await loc.count() > 0 and await loc.is_visible():
                        login_scope = scope
                        found_form = True
                        break
                except Exception:
                    continue
            if found_form:
                break
            await asyncio.sleep(0.2)

        if not found_form:
            print("[Ecount] 로그인 폼 탐지 실패(#com_code)")
            return False

        await login_scope.fill("#com_code", credentials["com_code"])
        await login_scope.fill("#id", credentials["user_id"])
        await login_scope.fill("#passwd", credentials["password"])

        await dismiss_login_overlay(page)
        await login_scope.click("#save")
        await confirm_connection_status_popup(page)
        try:
            await asyncio.sleep(0.3)
            alive_pages = [p for p in page.context.pages if not p.is_closed()]
            if alive_pages:
                page = alive_pages[-1]
        except Exception:
            pass
        await confirm_connection_status_popup(page)
        try:
            await page.wait_for_url(
                lambda u: "login.ecount.com" not in u.lower() or "/ec5/view/erp" in u.lower(),
                timeout=15000,
            )
        except Exception:
            pass
        await confirm_connection_status_popup(page)
        try:
            await page.wait_for_load_state("networkidle", timeout=10000)
        except Exception:
            pass
        await confirm_connection_status_popup(page)
        await asyncio.sleep(random.uniform(0.6, 1.1))

        current_url = page.url
        current_lower = current_url.lower()
        if (
            "/ec5/view/app.login/erp_login" in current_lower
            or "erp_login" in current_lower
        ):
            base_url = "/".join(current_url.split("/")[:3])
            erp_url = f"{base_url}/ec5/view/erp"
            try:
                await page.goto(erp_url, wait_until="domcontentloaded", timeout=30000)
                await confirm_connection_status_popup(page)
                try:
                    await page.wait_for_url(lambda u: "ec_req_sid=" in u, timeout=12000)
                except Exception:
                    pass
                await confirm_connection_status_popup(page)
                await asyncio.sleep(0.5)
                current_url = page.url
                current_lower = current_url.lower()
            except Exception as e:
                print(f"[Ecount] ERP 세션 페이지 이동 실패: {e}")

        if (
            "ec_req_sid=" in current_lower
            and "/ec5/view/erp" in current_lower
            and "login.ecount.com/login" not in current_lower
        ):
            print(f"[Ecount] 로그인 성공: {current_url}")
            return True

        try:
            if page.is_closed():
                return False
            error_elem = await page.query_selector('#error_msg, .login_error')
            if error_elem:
                error_text = (
                    await error_elem.get_attribute("value")
                    or await error_elem.inner_text()
                )
                print(f"[Ecount] 로그인 실패: {error_text}")
        except Exception as e:
            print(f"[Ecount] 로그인 실패 메시지 확인 생략: {e}")
        return False

    except Exception as e:
        print(f"[Ecount] 로그인 예외: {e}")
        return False


async def dismiss_login_overlay(page: Page) -> None:
    """
    변경 이유: 로그인 페이지에 뜨는 오버레이 팝업이 입력창을 가리는 경우를 자동으로 닫습니다.
    """
    try:
        close_selectors = [
            'button:has-text("닫기")',
            'a:has-text("닫기")',
            '[aria-label*="close" i]',
            '[title*="close" i]',
            '[title*="닫기"]',
            ".ui-dialog-titlebar-close",
            ".modal-close",
            ".popup-close",
        ]
        for sel in close_selectors:
            try:
                loc = page.locator(sel).first
                if await loc.count() > 0 and await loc.is_visible():
                    await loc.click(timeout=1000)
                    await asyncio.sleep(0.2)
                    print(f"[Ecount] 로그인 오버레이 닫기: {sel}")
                    return
            except Exception:
                continue

        clicked = await page.evaluate(
            """() => {
                const cands = [...document.querySelectorAll(
                    'button, a, span, div[role="button"]'
                )];
                const isVisible = (el) => {
                    const s = getComputedStyle(el);
                    return s.display !== 'none' && s.visibility !== 'hidden' && el.offsetParent !== null;
                };
                const hit = cands.find((el) => {
                    if (!isVisible(el)) return false;
                    const t = (el.innerText || '').trim();
                    if (!t) return false;
                    return t === 'X' || t === 'x' || t === '×' || t === '닫기';
                });
                if (!hit) return false;
                hit.click();
                return true;
            }"""
        )
        if clicked:
            await asyncio.sleep(0.2)
            print("[Ecount] 로그인 오버레이 닫기(JS)")
            return

        await page.keyboard.press("Escape")
        await asyncio.sleep(0.1)
    except Exception:
        pass


async def confirm_connection_status_popup(page: Page) -> bool:
    """
    변경 이유: 로그인 직후 노출되는 접속현황 팝업의 '확인' 버튼을 자동으로 클릭합니다.
    """
    scopes: list[Page | Frame] = [page, *page.frames]
    for scope in scopes:
        try:
            clicked = await scope.evaluate(
                """() => {
                    const dialogCandidates = [...document.querySelectorAll('div,section,article')];
                    const isVisible = (el) => {
                        if (!el) return false;
                        const s = getComputedStyle(el);
                        return s.display !== 'none' && s.visibility !== 'hidden' && el.offsetParent !== null;
                    };
                    const hasConnectionText = (el) => {
                        const t = (el.innerText || '').replace(/\\s+/g, ' ').trim();
                        if (!t) return false;
                        return t.includes('접속현황') || t.includes('동일한 ID로 현재 접속중인 사용자');
                    };
                    const dialog = dialogCandidates.find((el) => isVisible(el) && hasConnectionText(el));
                    if (!dialog) return false;
                    const buttons = [...dialog.querySelectorAll('button, a, [role="button"]')];
                    const confirmBtn = buttons.find((el) => {
                        if (!isVisible(el)) return false;
                        const t = (el.innerText || el.value || '').replace(/\\s+/g, ' ').trim();
                        return t === '확인' || t.startsWith('확인');
                    });
                    if (!confirmBtn) return false;
                    confirmBtn.click();
                    return true;
                }"""
            )
            if clicked:
                print("[Ecount] 접속현황 팝업 확인 클릭")
                await asyncio.sleep(0.2)
                return True
        except Exception:
            continue
    return False


async def extract_table_data(page: Page, menu: EcountMenu) -> list[dict]:
    """이카운트 구매현황/판매현황 데이터 추출."""
    rows_data: list[dict] = []
    try:
        await asyncio.sleep(0.8)
        rows = await page.query_selector_all("tr")
        context_label = "top"
        if not rows:
            for frame in page.frames:
                if not frame.url or frame.url == "about:blank":
                    continue
                try:
                    frame_rows = await frame.query_selector_all("tr")
                    if frame_rows:
                        rows = frame_rows
                        context_label = f"frame({frame.name or 'unnamed'})"
                        break
                except Exception:
                    continue

        if not rows:
            print("[Ecount] tr 요소 없음 - 그리드가 div 기반일 가능성.")
            return rows_data

        print(f"[Ecount] tr {len(rows)}개 감지 (context={context_label})")
        parsed_rows: list[list[str]] = []
        for tr in rows:
            tr_cells = await tr.query_selector_all("td, th")
            cells: list[str] = []
            if tr_cells:
                for cell in tr_cells:
                    cells.append((await cell.inner_text()).strip())
            else:
                row_text = (await tr.inner_text()).strip()
                if row_text:
                    cells = [c.strip() for c in row_text.split("\t")]
            if any(cells):
                parsed_rows.append(cells)
        if not parsed_rows:
            return rows_data

        header_hints = ["일자", "품목코드", "품목명", "거래처", "수량", "금액"]
        header_idx = -1
        for i, cells in enumerate(parsed_rows[:30]):
            row_text = " ".join(cells)
            hit_count = sum(1 for k in header_hints if k in row_text)
            if hit_count >= 2 and len(cells) >= 4:
                header_idx = i
                break
        if header_idx < 0:
            for i, cells in enumerate(parsed_rows[:30]):
                if len(cells) >= 5 and all(not c.replace(",", "").replace(".", "").isdigit() for c in cells[:3]):
                    header_idx = i
                    break

        if header_idx >= 0:
            headers = [h if h else f"col_{idx + 1}" for idx, h in enumerate(parsed_rows[header_idx])]
            data_rows = parsed_rows[header_idx + 1 :]
        else:
            # 변경 이유: 헤더 행을 찾지 못해도 데이터 적재를 위해 일반 컬럼명으로 폴백합니다.
            max_width = max(len(r) for r in parsed_rows)
            headers = [f"col_{i + 1}" for i in range(max_width)]
            data_rows = parsed_rows
            print("[Ecount] 헤더 탐지 실패 - 일반 컬럼명 폴백 적용")

        for cells in data_rows:
            if len(cells) < 4:
                continue
            first_text = cells[0].strip() if cells else ""
            if not first_text or "합계" in first_text or "소계" in first_text:
                continue
            row_dict: dict[str, str] = {}
            width = min(len(headers), len(cells))
            for i in range(width):
                row_dict[headers[i]] = cells[i].strip()
            if any(v.strip() for v in row_dict.values()):
                rows_data.append(row_dict)
        print(f"[Ecount] {menu.value} 데이터 {len(rows_data)}행 추출 완료")
        return rows_data
    except Exception as e:
        print(f"[Ecount] 테이블 추출 실패 ({menu.value}): {e}")
        return rows_data


async def apply_date_filter(page: Page, date_from: str, date_to: str) -> None:
    """날짜 필터: 이카운트 커스텀 드롭다운 + input 제어."""
    try:
        y1, m1, d1 = date_from.split("-")
        y2, m2, d2 = date_to.split("-")
        await page.wait_for_load_state("domcontentloaded", timeout=10000)

        ready = False
        for _ in range(40):
            try:
                count = await page.evaluate(
                    """() => {
                        const y = document.querySelectorAll('button.btn-selectbox[data-id="year"]').length;
                        const m = document.querySelectorAll('button.btn-selectbox[data-id="month"]').length;
                        const d = document.querySelectorAll('input#day').length;
                        return { y, m, d };
                    }"""
                )
                if count["y"] >= 2 and count["m"] >= 2 and count["d"] >= 2:
                    ready = True
                    break
            except Exception:
                pass
            await asyncio.sleep(0.25)
        if not ready:
            print("[Ecount] [WARN] 날짜 컴포넌트 타임아웃 - 필터 스킵")
            return

        async def _pick_dropdown(data_id: str, index: int, target_text: str) -> bool:
            try:
                btn_locator = page.locator(
                    f'button.btn-selectbox[data-id="{data_id}"]'
                ).nth(index)
                current = (await btn_locator.locator(".selectbox-label").inner_text()).strip()
                if current == target_text:
                    return True
                await btn_locator.click()
                await asyncio.sleep(0.2)
                clicked = await page.evaluate(
                    """([txt]) => {
                        const popups = [...document.querySelectorAll(
                            'ul.dropdown-menu.show.dropdown-menu-selectbox'
                        )];
                        const visible = popups.find(p => p.offsetParent !== null);
                        if (!visible) return { ok: false };
                        const anchors = [...visible.querySelectorAll('li > a')];
                        const hit = anchors.find(a => (a.innerText || '').trim() === txt);
                        if (!hit) return { ok: false };
                        hit.click();
                        return { ok: true };
                    }""",
                    [target_text],
                )
                if not clicked.get("ok"):
                    await page.keyboard.press("Escape")
                    return False
                await asyncio.sleep(0.15)
                return True
            except Exception:
                return False

        async def _set_day(index: int, target_day: str) -> bool:
            try:
                locator = page.locator("input#day").nth(index)
                current = (await locator.input_value()).strip()
                if current == target_day:
                    return True
                await locator.click()
                await locator.press("ControlOrMeta+A")
                await locator.type(target_day, delay=15)
                await locator.press("Tab")
                await asyncio.sleep(0.1)
                return True
            except Exception:
                return False

        await _pick_dropdown("year", 0, y1)
        await _pick_dropdown("month", 0, m1)
        await _pick_dropdown("year", 1, y2)
        await _pick_dropdown("month", 1, m2)
        await _set_day(0, d1)
        await _set_day(1, d2)
        await asyncio.sleep(0.2)

        search_clicked = False
        try:
            result = await page.evaluate(
                """() => {
                    const candidates = [...document.querySelectorAll(
                        'button, a, div[role="button"], span[role="button"]'
                    )];
                    const btn = candidates.find(b => {
                        const t = (b.innerText || '').trim();
                        return t === '검색(F8)' || t.startsWith('검색(F8)');
                    });
                    if (btn) { btn.click(); return '검색(F8)'; }
                    const byId = document.getElementById('header_search');
                    if (byId) { byId.click(); return 'header_search'; }
                    return null;
                }"""
            )
            if result:
                search_clicked = True
        except Exception:
            pass
        if not search_clicked:
            await page.keyboard.press("F8")
        await asyncio.sleep(2.0)
    except Exception as e:
        print(f"[Ecount] 날짜 필터 설정 실패: {e}")


async def download_excel_bytes(
    page: Page,
    company_code: str,
    menu_value: str,
) -> bytes | None:
    """페이지/프레임에서 Excel 버튼 탐색 후 다운로드 바이트 반환."""
    try:
        await page.wait_for_load_state("networkidle", timeout=15000)
    except Exception:
        pass

    for _ in range(40):
        ready = False
        for fr in [page, *page.frames]:
            try:
                if await fr.evaluate(_EXCEL_BTN_PROBE_JS):
                    ready = True
                    break
            except Exception:
                continue
        if ready:
            break
        await asyncio.sleep(0.3)
    selectors = excel_selectors_for_download()
    try:
        async with page.expect_download(timeout=60_000) as dl_info:
            clicked = False
            for fr in [page, *page.frames]:
                for sel in selectors:
                    try:
                        loc = fr.locator(sel).first
                        if await loc.count() > 0 and await loc.is_visible():
                            await loc.click(timeout=3000)
                            print(f"[Ecount] 엑셀 버튼 클릭: {sel}")
                            clicked = True
                            break
                    except Exception:
                        continue
                if clicked:
                    break
            if not clicked:
                for fr in [page, *page.frames]:
                    try:
                        clicked = await fr.evaluate(
                            """() => {
                                const cands = [...document.querySelectorAll(
                                    'button, a, input[type="button"], [role="button"]'
                                )];
                                const visible = (el) => {
                                    const s = getComputedStyle(el);
                                    return s.display !== 'none' && s.visibility !== 'hidden' &&
                                           el.offsetParent !== null;
                                };
                                const hit = cands.find((el) => {
                                    if (!visible(el)) return false;
                                    const t = (el.innerText || el.value || '').trim();
                                    return t.includes('Excel') || t.includes('엑셀');
                                });
                                if (!hit) return false;
                                hit.click();
                                return true;
                            }"""
                        )
                        if clicked:
                            print("[Ecount] 엑셀 버튼 JS 클릭 폴백 성공")
                            break
                    except Exception:
                        continue
            if not clicked:
                print("[Ecount] 엑셀 버튼을 찾지 못해 다운로드를 시작하지 못했습니다.")
                return None
        download: Download = await dl_info.value
        path = await download.path()
        if not path:
            return None
        with open(path, "rb") as f:
            data = f.read()
        print(f"[Ecount] 엑셀 다운로드 완료: {len(data)} bytes")
        if should_save_raw_excel_file():
            try:
                save_dir = os.path.join(
                    os.path.dirname(os.path.abspath(__file__)),
                    "storage",
                    "excel",
                )
                os.makedirs(save_dir, exist_ok=True)
                ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                ext = "csv" if data[:4] != b"PK\x03\x04" else "xlsx"
                save_path = os.path.join(save_dir, f"{company_code}_{menu_value}_{ts}.{ext}")
                with open(save_path, "wb") as wf:
                    wf.write(data)
            except Exception as e:
                print(f"[Ecount] 원본 파일 저장 실패(무시): {e}")
        return data
    except Exception as e:
        print(f"[Ecount] 엑셀 다운로드 실패: {e}")
        return None


async def crawl(
    menu: str,
    date_from: str,
    date_to: str,
    cookie_path: str,
    credentials: dict,
) -> dict[str, object]:
    """실제 크롤링 로직. 별도 프로세스 안에서만 호출."""
    menu_enum = EcountMenu(menu)
    results: list[dict] = []
    async with async_playwright() as p:
        print(f"\n[Ecount] '{menu_enum.value}' 크롤링 시작 ({date_from} ~ {date_to})")
        remove_cookie_file(cookie_path)
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
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context(
            user_agent=str(context_kwargs["user_agent"]),
            locale="ko-KR",
            timezone_id="Asia/Seoul",
            accept_downloads=True,
        )
        page = await context.new_page()
        login_success = False
        for attempt in range(2):
            login_success = await login(page, credentials)
            if login_success:
                break
            print(f"[Ecount] 자동 로그인 재시도: {attempt + 1}/2 실패")
            await asyncio.sleep(0.8)
        if login_success:
            try:
                page = pick_alive_page(page)
            except Exception:
                pass
            if page.is_closed():
                page = await context.new_page()
            os.makedirs(os.path.dirname(cookie_path), exist_ok=True)
            await context.storage_state(path=cookie_path)
        else:
            raise RuntimeError("[Ecount] 자동 로그인 실패.")

        try:
            nav = resolve_menu_navigation(menu_enum, credentials)
            prg_id = (nav.get("prg_id") or "").strip()
            if not prg_id:
                raise ValueError(f"prgId 미설정: {menu_enum.value}")
            current_url = page.url
            base_url = "/".join(current_url.split("/")[:3])
            from urllib.parse import parse_qs, urlparse

            parsed = urlparse(current_url)
            ec_req_sid = parse_qs(parsed.query).get("ec_req_sid", [""])[0]
            if not ec_req_sid:
                erp_main = f"{base_url}/ec5/view/erp"
                await page.goto(erp_main, wait_until="domcontentloaded", timeout=30000)
                parsed2 = urlparse(page.url)
                ec_req_sid = parse_qs(parsed2.query).get("ec_req_sid", [""])[0]
                base_url = "/".join(page.url.split("/")[:3])
            if not ec_req_sid:
                raise RuntimeError("ec_req_sid 획득 실패")

            target_url = (
                f"{base_url}/ec5/view/erp"
                f"?w_flag=1&ec_req_sid={ec_req_sid}"
                f"#menuType={nav['menu_type']}&menuSeq={nav['menu_seq']}"
                f"&groupSeq={nav['group_seq']}&prgId={prg_id}&depth={nav['depth']}"
            )
            await page.goto(target_url, wait_until="domcontentloaded", timeout=30000)
            await wait_for_s_page_content(page)

            if menu_enum == EcountMenu.생산입고조회:
                cc = str(credentials.get("company_code") or "unknown")
                xlsx_bytes = await download_excel_bytes(page, cc, menu_enum.value)
                return {"extractor": "excel", "bytes": xlsx_bytes}

            await apply_date_filter(page, date_from, date_to)
            results = await extract_table_data(page, menu_enum)
            crawled_at = datetime.now().isoformat()
            cc = str(credentials.get("company_code") or "")
            cl = str(credentials.get("company_label") or "")
            for row in results:
                row["_menu"] = menu_enum.value
                row["_date_from"] = date_from
                row["_date_to"] = date_to
                row["_crawled_at"] = crawled_at
                row["_company_code"] = cc
                row["_company_label"] = cl
        except Exception as e:
            print(f"[Ecount] 데이터 추출 중 오류: {e}")
        finally:
            await browser.close()
    return {"extractor": "table", "rows": results}


def run_in_new_process(
    menu: str,
    date_from: str,
    date_to: str,
    cookie_path: str,
    credentials: dict,
) -> dict[str, object]:
    """ProcessPoolExecutor 진입점."""
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    return asyncio.run(crawl(menu, date_from, date_to, cookie_path, credentials))


def resolve_menu_page_type(menu: EcountMenu) -> str:
    """메뉴별 페이지 유형."""
    if menu == EcountMenu.생산입고조회:
        return "excel_only"
    if menu in (EcountMenu.구매현황, EcountMenu.판매현황):
        return "search_excel"
    return "filter_excel"


async def trigger_search_f8_only(page: Page) -> None:
    """구매현황/판매현황에서 날짜 조작 없이 검색(F8)만 실행."""
    clicked = False
    frames = [page, *page.frames]
    for fr in frames:
        try:
            label = await fr.evaluate(
                """() => {
                    const cands = [...document.querySelectorAll(
                        'button, a, div[role="button"], span[role="button"]'
                    )];
                    const btn = cands.find(b => {
                        const t = (b.innerText || '').trim();
                        return t === '검색(F8)' || t.startsWith('검색(F8)');
                    });
                    if (btn) { btn.click(); return 'ok'; }
                    const byId = document.getElementById('header_search');
                    if (byId) { byId.click(); return 'header_search'; }
                    return null;
                }"""
            )
            if label:
                print(f"[Ecount] 검색 실행: {label}")
                clicked = True
                break
        except Exception:
            continue
    if not clicked:
        await page.keyboard.press("F8")
    await asyncio.sleep(2.0)


def extract_base_and_sid_from_url(url: str) -> tuple[str, str]:
    """현재 URL에서 base_url, ec_req_sid 추출."""
    from urllib.parse import parse_qs, urlparse

    base_url = "/".join(url.split("/")[:3]) if url else ""
    try:
        parsed = urlparse(url)
        sid = parse_qs(parsed.query).get("ec_req_sid", [""])[0]
    except Exception:
        sid = ""
    return base_url, sid


def pick_alive_page(page: Page) -> Page:
    """현재 컨텍스트에서 닫히지 않은 페이지를 고른다."""
    if not page.is_closed():
        return page
    ctx = page.context
    for p in reversed(ctx.pages):
        if not p.is_closed():
            return p
    return page


def extract_sid_from_context_pages(page: Page) -> tuple[Page, str, str] | None:
    """컨텍스트 내 열린 페이지 URL에서 ec_req_sid를 탐색한다."""
    ctx = page.context
    for p in reversed(ctx.pages):
        if p.is_closed():
            continue
        base_url, sid = extract_base_and_sid_from_url(p.url)
        if sid:
            return p, base_url, sid
    return None


async def ensure_session_sid(page: Page) -> tuple[Page, str, str]:
    """멀티 메뉴 순회용 세션 정보 확보."""
    page = pick_alive_page(page)
    hit = extract_sid_from_context_pages(page)
    if hit:
        return hit
    base_url, ec_req_sid = extract_base_and_sid_from_url(page.url)
    if ec_req_sid:
        return page, base_url, ec_req_sid
    candidates = []
    if base_url:
        candidates.append(f"{base_url}/ec5/view/erp")
        candidates.append(f"{base_url}/ec5/view/erp?w_flag=1")
        candidates.append(f"{base_url}/ec5/view/main")
    for erp_main in candidates:
        page = pick_alive_page(page)
        if page.is_closed():
            page = await page.context.new_page()
        try:
            await page.goto(erp_main, wait_until="domcontentloaded", timeout=30000)
            try:
                await page.wait_for_url(lambda u: "ec_req_sid=" in u, timeout=8000)
            except Exception:
                pass
            await asyncio.sleep(0.4)
            hit2 = extract_sid_from_context_pages(page)
            if hit2:
                return hit2
            base_url2, sid2 = extract_base_and_sid_from_url(page.url)
            if sid2:
                return page, base_url2, sid2
        except Exception:
            pass
    raise RuntimeError("ec_req_sid 획득 실패 - 로그인 후 ERP 세션 URL을 확인하세요.")


async def open_menu_in_existing_session(
    page: Page,
    nav: dict[str, str],
    base_url: str,
    ec_req_sid: str | None,
) -> None:
    """동일 브라우저 세션에서 메뉴 URL만 교체."""
    if ec_req_sid:
        target_url = (
            f"{base_url}/ec5/view/erp"
            f"?w_flag=1&ec_req_sid={ec_req_sid}"
            f"#menuType={nav['menu_type']}&menuSeq={nav['menu_seq']}"
            f"&groupSeq={nav['group_seq']}&prgId={nav['prg_id']}&depth={nav['depth']}"
        )
    else:
        target_url = (
            f"{base_url}/ec5/view/erp?w_flag=1"
            f"#menuType={nav['menu_type']}&menuSeq={nav['menu_seq']}"
            f"&groupSeq={nav['group_seq']}&prgId={nav['prg_id']}&depth={nav['depth']}"
        )
    await page.goto(target_url, wait_until="domcontentloaded", timeout=30000)
    await wait_for_s_page_content(page)


async def wait_for_s_page_content(page: Page) -> None:
    """s_page iframe의 실제 메뉴 컨텐츠 로딩을 대기합니다."""
    print("[Ecount] s_page iframe 실제 로드 대기 중...")
    iframe_loaded = False
    for attempt in range(40):
        s_page = page.frame(name="s_page")
        if s_page is not None:
            frame_url = s_page.url or ""
            if frame_url and frame_url != "about:blank":
                try:
                    has_content = await s_page.evaluate(
                        """() => {
                            const selectCount = document.querySelectorAll('select').length;
                            const bodyText = (document.body && document.body.innerText) || '';
                            return selectCount >= 2
                                || bodyText.includes('기준일자')
                                || bodyText.includes('검색(F8)')
                                || bodyText.includes('Excel')
                                || bodyText.includes('엑셀');
                        }"""
                    )
                    if has_content:
                        iframe_loaded = True
                        print(f"[Ecount] s_page 로드 완료 ({attempt * 0.25:.1f}s)")
                        break
                except Exception:
                    pass
        await asyncio.sleep(0.25)
    if not iframe_loaded:
        print("[Ecount] [WARN] s_page 컨텐츠 로드 타임아웃 - 진행은 계속")
    await asyncio.sleep(0.6)


async def run_menu_once_in_session(
    page: Page,
    menu: EcountMenu,
    date_from: str,
    date_to: str,
    credentials: dict[str, object],
    page_type: str,
) -> tuple[Page, dict[str, object]]:
    """열린 세션에서 메뉴 1개를 1회 실행."""
    nav = resolve_menu_navigation(menu, credentials)
    prg_id = (nav.get("prg_id") or "").strip()
    if not prg_id:
        raise ValueError(f"prgId 미설정: {menu.value}")
    try:
        page, base_url, ec_req_sid = await ensure_session_sid(page)
    except Exception:
        page = pick_alive_page(page)
        base_url, _ = extract_base_and_sid_from_url(page.url)
        if not base_url:
            base_url = "https://logincc.ecount.com"
        ec_req_sid = None
    await open_menu_in_existing_session(page, nav, base_url, ec_req_sid)

    if page_type == "excel_only":
        cc = str(credentials.get("company_code") or "unknown")
        xlsx_bytes = await download_excel_bytes(page, cc, menu.value)
        return page, {"extractor": "excel", "bytes": xlsx_bytes}
    if page_type == "search_excel":
        await trigger_search_f8_only(page)
        cc = str(credentials.get("company_code") or "unknown")
        xlsx_bytes = await download_excel_bytes(page, cc, menu.value)
        return page, {"extractor": "excel", "bytes": xlsx_bytes}
    if page_type == "filter_excel":
        await apply_date_filter(page, date_from, date_to)
        cc = str(credentials.get("company_code") or "unknown")
        xlsx_bytes = await download_excel_bytes(page, cc, menu.value)
        return page, {"extractor": "excel", "bytes": xlsx_bytes}

    await apply_date_filter(page, date_from, date_to)
    rows = await extract_table_data(page, menu)
    crawled_at = datetime.now().isoformat()
    cc = str(credentials.get("company_code") or "")
    cl = str(credentials.get("company_label") or "")
    for row in rows:
        row["_menu"] = menu.value
        row["_date_from"] = date_from
        row["_date_to"] = date_to
        row["_crawled_at"] = crawled_at
        row["_company_code"] = cc
        row["_company_label"] = cl
    return page, {"extractor": "table", "rows": rows}


async def recreate_login_context(
    playwright_instance,
    context_kwargs: dict[str, object],
) -> tuple[object, object, Page]:
    """
    변경 이유: 로그인 재시도마다 새 브라우저/컨텍스트/페이지를 강제 생성해
    닫힌 페이지 컨텍스트를 확실히 복구합니다.
    """
    browser = await playwright_instance.chromium.launch(headless=False)
    context = await browser.new_context(
        user_agent=str(context_kwargs["user_agent"]),
        locale="ko-KR",
        timezone_id="Asia/Seoul",
        accept_downloads=True,
    )
    page = await context.new_page()
    return browser, context, page
