"""
GL-RADS | Ecount ERP 크롤러
대상: https://login.ecount.com
추출: 구매현황·판매현황(DOM), 생산입고조회(메뉴 URL 직접 진입 -> 엑셀만 + pandas)
저장: Supabase PostgreSQL

적용 패턴 출처:
  - ProcessPoolExecutor 격리: taobao/crawler.py
  - Headless 동적 전환 + 쿠키 세션: xhs/crawler.py
  - BrowserPool 구조: douyin/crawler.py

───────────────────────────────────────────────────────────────
[성능 최적화 요약 - 2026-04-17]
  데이터 추출 결과는 변경 없음. 대기시간만 단축.

  구간별 예상 실행시간 (세션 유효 + 쿠키 존재 시나리오):
    _login()             5.5s -> 2.0s  (-3.5s, 재로그인 시)
    _check_session()     1.0s -> 0.4s  (-0.6s)
    _extract_table_data  2.0s -> 0.8s  (-1.2s)
    _apply_date_filter
      - iframe polling   20s -> 10s    (타임아웃 시 -10s)
      - dropdown × 4    2.8s -> 1.4s  (-1.4s)
      - day × 2         0.6s -> 0.2s  (-0.4s)
      - 검색 전/후 대기 5.5s -> 2.2s  (-3.3s)
    _crawl iframe wait   30s -> 10s    (타임아웃 시 -20s)
    _crawl 렌더 안정화   1.5s -> 0.6s  (-0.9s)
    crawl_all 메뉴 간딜 4.5s -> 1.5s  (-3.0s, 메뉴 1회당)
    디버그 덤프 블록     제거         (정상 모드는 영향 0)

  단일 메뉴 성공 경로 합계:
    before ≈ 35~40s  ->  after ≈ 17~20s  (약 50% 단축)
───────────────────────────────────────────────────────────────
"""

import os
import sys
import io
import asyncio
import random
import json
from datetime import datetime
from enum import Enum
import structlog
import pandas as pd
from playwright.async_api import (
    async_playwright,
    Page,
    Download,
)
from supabase import create_client, Client

logger = structlog.get_logger()

# scripts/ -> 한 단계 위가 프로젝트 루트(gl-dashboard/)
# 프로젝트 루트의 .env.local에서 환경변수 로드
try:
    from dotenv import load_dotenv  # type: ignore

    _PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    _ENV_LOCAL = os.path.join(_PROJECT_ROOT, ".env.local")

    if os.path.exists(_ENV_LOCAL):
        load_dotenv(dotenv_path=_ENV_LOCAL, override=False)  # 시스템 환경변수(set ECOUNT_DEBUG=1) 우선
        print(f"[Ecount] 환경변수 로드: {_ENV_LOCAL}")
    else:
        print(f"[Ecount] .env.local 미발견: {_ENV_LOCAL}")
except Exception:
    pass

# ──────────────────────────────────────────────
# 환경 변수 - 기업별 자격증명은 COMPANY_REGISTRY + credentials_bundle_for_company 참고
# ──────────────────────────────────────────────
SUPABASE_URL      = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY      = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")  # service_role (쓰기 권한)


# ──────────────────────────────────────────────
# 추출 대상 메뉴 정의
# ──────────────────────────────────────────────
class EcountMenu(str, Enum):
    """Ecount 메뉴. 생산입고조회는 메뉴 URL 진입 후 엑셀만 받아 pandas 정규화."""

    구매현황 = "purchase"
    판매현황 = "sales"
    재고현황 = "inventory"
    발주현황 = "order"
    생산입고조회 = "production_receipt"


class EcountCompanyCode(str, Enum):
    """대시보드 orderMeta.ts ORDER_COMPANIES.code 와 동일한 기업 코드."""

    gl = "gl"
    glpharm = "glpharm"
    hnb = "hnb"


# 메뉴별 Supabase 테이블 매핑
TABLE_MAP = {
    EcountMenu.구매현황: "ecount_purchase",
    EcountMenu.판매현황: "ecount_sales",
    EcountMenu.재고현황: "ecount_inventory",
    EcountMenu.발주현황: "ecount_order",
    EcountMenu.생산입고조회: "ecount_production_receipt",
}

# 메뉴별 prgId 매핑 (2026-04-16 실제 URL에서 확인)
# URL 패턴: https://loginab.ecount.com/ec5/view/erp?w_flag=1&ec_req_sid={동적}#prgId={prgId}
#
# 확인된 prgId:
#   구매현황: E040305  ← 실제 URL에서 확인 완료
#   판매현황: ⚠️ 판매현황 메뉴 접속 후 URL의 prgId 값 입력 필요
#   재고현황: ⚠️ 미확인
#   발주현황: ⚠️ 미확인
MENU_PRG_ID = {
    EcountMenu.구매현황: "E040305",
    EcountMenu.판매현황: "E040207",
    EcountMenu.재고현황: "",   # ⚠️ 재고현황 URL에서 prgId 확인 후 입력
    EcountMenu.발주현황: "",   # ⚠️ 발주현황 URL에서 prgId 확인 후 입력
    # 생산입고조회: 재고 I 트리의 프로그램 ID - 브라우저 주소창 #prgId= 값을 .env 로 주입
    EcountMenu.생산입고조회: "",
}

# 생산입고조회 기본 해시(재고 I 계열 추정). 반드시 실제 ERP URL과 대조 후 env 오버라이드 권장.
_PRODUCTION_RECEIPT_NAV_BASE: dict[str, str] = {
    "menu_type": "MENUTREE_000004",
    "menu_seq": "MENUTREE_000215",
    "group_seq": "MENUTREE_000035",
    "prg_id": "",
    "depth": "4",
}

# 대시보드 orderMeta.ts ORDER_COMPANIES 와 동일한 코드 체계
# 메뉴 URL 오버라이드: ECOUNT_{접두사 블록}_PURCHASE_PRG_ID 등
#   예) ECOUNT_GL_PURCHASE_PRG_ID - 접두사는 세 번째 요소(GL -> ECOUNT_GL)
COMPANY_REGISTRY: list[tuple[EcountCompanyCode, str, str]] = [
    (EcountCompanyCode.gl, "지엘", "ECOUNT_GL"),
    (EcountCompanyCode.glpharm, "지엘팜", "ECOUNT_GLPHARM"),
    (EcountCompanyCode.hnb, "에이치앤비", "ECOUNT_HNB"),
]

_DEFAULT_ERP_HASH: dict[str, str] = {
    "menu_type": "MENUTREE_000004",
    "menu_seq": "MENUTREE_000513",
    "group_seq": "MENUTREE_000031",
    "depth": "4",
}


def normalize_company_code(company_code: str | EcountCompanyCode | None) -> str:
    """None 이면 지엘팜(기존 단일 기업 기본값)."""
    if company_code is None:
        return EcountCompanyCode.glpharm.value
    if isinstance(company_code, EcountCompanyCode):
        return company_code.value
    return company_code.strip().lower()


def company_env_prefix(company_code: str | EcountCompanyCode | None) -> str | None:
    """알려진 기업 코드면 .env 접두사(ECOUNT_XX)를 반환."""
    normalized = normalize_company_code(company_code)
    for co, _label, prefix in COMPANY_REGISTRY:
        if co.value == normalized:
            return prefix
    return None


def _nav_block_from_env(prefix: str, block: str, defaults: dict[str, str]) -> dict[str, str]:
    """메뉴별 ERP 해시 파라미터 - {prefix}_{block}_PRG_ID 등으로 기업별 오버라이드."""
    result = dict(defaults)
    mapping: list[tuple[str, str]] = [
        ("prg_id", "PRG_ID"),
        ("menu_type", "MENU_TYPE"),
        ("menu_seq", "MENU_SEQ"),
        ("group_seq", "GROUP_SEQ"),
        ("depth", "DEPTH"),
    ]
    for py_key, env_suffix in mapping:
        val = os.getenv(f"{prefix}_{block}_{env_suffix}")
        if val and val.strip():
            result[py_key] = val.strip()
    return result


def load_menu_navigation_from_env(prefix: str) -> dict[str, dict[str, str]]:
    """기업 접두사 기준 전 메뉴 내비게이션(기본값 + env 오버라이드)."""
    base = _DEFAULT_ERP_HASH
    return {
        "purchase": _nav_block_from_env(
            prefix,
            "PURCHASE",
            {**base, "prg_id": MENU_PRG_ID[EcountMenu.구매현황]},
        ),
        "sales": _nav_block_from_env(
            prefix,
            "SALES",
            {**base, "prg_id": MENU_PRG_ID[EcountMenu.판매현황]},
        ),
        "inventory": _nav_block_from_env(
            prefix,
            "INVENTORY",
            {**base, "prg_id": MENU_PRG_ID[EcountMenu.재고현황]},
        ),
        "order": _nav_block_from_env(
            prefix,
            "ORDER",
            {**base, "prg_id": MENU_PRG_ID[EcountMenu.발주현황]},
        ),
        "production_receipt": _nav_block_from_env(
            prefix,
            "PRODUCTION_RECEIPT",
            {
                **_PRODUCTION_RECEIPT_NAV_BASE,
                "prg_id": MENU_PRG_ID[EcountMenu.생산입고조회]
                or _PRODUCTION_RECEIPT_NAV_BASE["prg_id"],
            },
        ),
    }


def credentials_bundle_for_company(
    company_code: str | EcountCompanyCode | None,
) -> dict[str, object] | None:
    """
    기업별 로그인 정보 + 메뉴 URL 파라미터.
    COM_CODE / USER_ID / USER_PW 중 하나라도 없으면 None.
    """
    normalized = normalize_company_code(company_code)
    prefix = company_env_prefix(normalized)
    if prefix is None:
        return None
    com = (os.getenv(f"{prefix}_COM_CODE") or "").strip()
    uid = (os.getenv(f"{prefix}_USER_ID") or "").strip()
    pw = (os.getenv(f"{prefix}_USER_PW") or "").strip()
    if not com or not uid or not pw:
        return None
    label = next(l for co, l, p in COMPANY_REGISTRY if co.value == normalized)
    return {
        "com_code": com,
        "user_id": uid,
        "password": pw,
        "company_code": normalized,
        "company_label": label,
        "menu_navigation": load_menu_navigation_from_env(prefix),
    }


def list_configured_company_codes() -> list[str]:
    """세 변수가 모두 설정된 기업만 (순회 크롤링용)."""
    return [
        co.value
        for co, _l, _p in COMPANY_REGISTRY
        if credentials_bundle_for_company(co.value) is not None
    ]


def resolve_menu_navigation(menu_enum: EcountMenu, credentials: dict[str, object]) -> dict[str, str]:
    """크롤 메뉴에 맞는 prgId·menuSeq 등."""
    key = menu_enum.value
    nav_root = credentials.get("menu_navigation")
    if not isinstance(nav_root, dict):
        raise ValueError("credentials에 menu_navigation이 없습니다.")
    block = nav_root.get(key)
    if not isinstance(block, dict):
        raise ValueError(f"menu_navigation[{key}]이 없습니다.")
    return block


def cookie_path_for_company(company_code: str | EcountCompanyCode | None) -> str:
    """기업별 세션 파일 - 계정이 다르므로 쿠키를 분리 저장."""
    normalized = normalize_company_code(company_code)
    cookie_dir = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        "storage",
        "cookies",
    )
    return os.path.join(cookie_dir, f"ecount_session_{normalized}.json")


def _playwright_storage_state_path_or_none(cookie_path: str) -> str | None:
    """
    Playwright storage_state 로드 가능한 JSON만 경로 반환.
    빈 파일·깨진 JSON이면 None (JSONDecodeError 원인 제거).
    """
    if not os.path.isfile(cookie_path):
        return None
    try:
        size = os.path.getsize(cookie_path)
        if size == 0:
            print(
                f"[Ecount] 쿠키 파일이 비어 있음 -> storage_state 생략·파일 삭제: "
                f"{cookie_path}"
            )
            try:
                os.remove(cookie_path)
            except OSError:
                pass
            return None
        with open(cookie_path, encoding="utf-8") as f:
            raw = f.read().strip()
        if not raw:
            print(
                f"[Ecount] 쿠키 파일 내용 공백 -> storage_state 생략·파일 삭제: "
                f"{cookie_path}"
            )
            try:
                os.remove(cookie_path)
            except OSError:
                pass
            return None
        data = json.loads(raw)
        if not isinstance(data, dict):
            print(f"[Ecount] 쿠키 JSON이 객체가 아님 -> 생략: {cookie_path}")
            return None
        if "cookies" not in data:
            print(
                f"[Ecount] Playwright storage_state 형식 아님(cookies 없음) -> 생략: "
                f"{cookie_path}"
            )
            return None
        return cookie_path
    except json.JSONDecodeError as e:
        print(
            f"[Ecount] 쿠키 JSON 파싱 실패 -> storage_state 생략 ({e}): {cookie_path}"
        )
        return None


# ──────────────────────────────────────────────
# ProcessPoolExecutor 진입점 (일반 함수 필수)
# xhs/crawler.py의 _run_in_new_process 패턴 동일 적용
# ──────────────────────────────────────────────
def _run_in_new_process(
    menu: str,
    date_from: str,
    date_to: str,
    cookie_path: str,
    credentials: dict,
) -> dict[str, object]:
    """
    uvicorn SelectorEventLoop과 Playwright 충돌 방지.
    ProcessPoolExecutor에서 호출 -> 내부에서 asyncio.run() 재시작.

    Returns:
        {"extractor": "table", "rows": list[dict]} 또는
        {"extractor": "excel", "bytes": bytes | None}
    """
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

    return asyncio.run(
        _crawl(menu, date_from, date_to, cookie_path, credentials)
    )


# ──────────────────────────────────────────────
# 로그인 헬퍼
# ──────────────────────────────────────────────
async def _login(page: Page, credentials: dict) -> bool:
    """
    이카운트 로그인 수행.
    성공 시 True, 실패 시 False 반환.

    확인된 selector (2026-04-16):
      회사코드: #com_code  (name="com_code")
      아이디:   #id        (name="id")
      비밀번호: #passwd    (name="passwd")
      로그인:   #save      (id="save", type="button")
    """
    # 변경 이유: 로그인 버튼 클릭 직후 네비게이션 경합으로 인한 context destroyed 예외를 줄입니다.
    try:
        await page.goto(
            "https://login.ecount.com/Login/?lan_type=ko-KR/",
            wait_until="domcontentloaded",
            timeout=30000,
        )
        await asyncio.sleep(random.uniform(0.4, 0.8))

        await page.fill('#com_code', credentials["com_code"])
        await page.fill('#id', credentials["user_id"])
        await page.fill('#passwd', credentials["password"])

        await page.click('#save')
        try:
            await page.wait_for_url(
                lambda u: "login.ecount.com" not in u.lower() or "/ec5/view/erp" in u.lower(),
                timeout=15000,
            )
        except Exception:
            pass
        try:
            await page.wait_for_load_state("networkidle", timeout=10000)
        except Exception:
            pass
        await asyncio.sleep(random.uniform(0.6, 1.1))

        # 로그인 성공 확인: URL이 login 도메인에서 벗어났는지 체크
        current_url = page.url
        if "login.ecount.com" not in current_url:
            print(f"[Ecount] 로그인 성공: {current_url}")
            return True

        # 에러 메시지 체크
        try:
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


# ──────────────────────────────────────────────
# 세션 유효성 체크
# xhs/crawler.py의 headless 동적 전환 패턴 적용
# ──────────────────────────────────────────────
async def _check_session(page: Page) -> bool:
    """현재 세션이 유효한지 확인."""
    try:
        await page.goto(
            "https://login.ecount.com/Login/?lan_type=ko-KR/",
            wait_until="domcontentloaded",
            timeout=20000,
        )
        # [최적화] 1.0s 평균 -> 0.4s (약 -0.6s)
        await asyncio.sleep(random.uniform(0.3, 0.5))

        # 로그인 페이지로 리다이렉트되지 않으면 세션 유효
        current_url = page.url
        login_form = await page.query_selector('input[name="COM_CODE"], #COM_CODE')

        if login_form or "Login" in current_url:
            return False  # 세션 만료
        return True

    except Exception:
        return False


# ──────────────────────────────────────────────
# 테이블 데이터 추출 공통 함수
# ──────────────────────────────────────────────
async def _extract_table_data(page: Page, menu: EcountMenu) -> list[dict]:
    """
    이카운트 구매현황/판매현황 데이터 추출.

    확정 구조 (2026-04-16 검증):
      UI는 top page document에 렌더링 (s_page iframe은 about:blank 빈 컨테이너).
      따라서 top page에서 먼저 tr을 찾고, 실패 시에만 전체 frame 순회.

    주의: 이카운트가 그리드를 <table> 기반으로 쓰는지, <div> 가상 스크롤로 쓰는지
    케이스별 차이가 있어 현재 구현은 <tr> 기반만 지원. div 기반이면 추후 확장 필요.
    """
    rows_data: list[dict] = []

    try:
        # [최적화] 초기 안정화 2.0s -> 0.8s (약 -1.2s)
        await asyncio.sleep(0.8)

        # top page 우선
        target = page
        rows = await page.query_selector_all('tr')
        context_label = "top"

        # 못 찾으면 전체 frame 순회 (s_page 폴백 포함)
        if not rows:
            for f in page.frames:
                if not f.url or f.url == "about:blank":
                    continue
                try:
                    frame_rows = await f.query_selector_all('tr')
                    if frame_rows:
                        rows = frame_rows
                        target = f
                        context_label = f"frame({f.name or 'unnamed'})"
                        break
                except Exception:
                    continue

        if not rows:
            print(f"[Ecount] tr 요소 없음 - 그리드가 div 기반일 가능성. "
                  f"검색 결과 영역의 실제 DOM 구조 확인 필요")
            return rows_data

        print(f"[Ecount] tr {len(rows)}개 감지 (context={context_label})")

        # 헤더 검증 - 페이지 내 다른 tr(메뉴/레이아웃용)과 구분 필요
        # 구매현황 헤더 필수 키워드로 실제 데이터 테이블 식별
        HEADER_HINTS = ['일자', '품목코드', '품목명', '거래처']
        header_row = None
        data_start_idx = 0

        for i, tr in enumerate(rows[:20]):  # 상위 20개 tr만 스캔
            text = (await tr.inner_text()).strip()
            hit_count = sum(1 for k in HEADER_HINTS if k in text)
            if hit_count >= 2:  # 2개 이상 키워드 매칭 시 헤더로 판정
                header_row = tr
                data_start_idx = i + 1
                break

        if header_row is None:
            print(f"[Ecount] 구매현황 테이블 헤더 미감지 - 상위 tr 샘플:")
            for i, tr in enumerate(rows[:5]):
                preview = (await tr.inner_text()).strip().replace('\n', ' ')[:100]
                print(f"  tr[{i}]: {preview}")
            return rows_data

        header_text = (await header_row.inner_text()).strip()
        headers = [h.strip() for h in header_text.split('\t') if h.strip()]
        print(f"[Ecount] 헤더 확인 (tr[{data_start_idx - 1}]): {headers}")

        for tr in rows[data_start_idx:]:
            cell_text = (await tr.inner_text()).strip()
            if not cell_text:
                continue
            cells = cell_text.split('\t')
            if len(cells) < len(headers):
                continue
            row_dict = {headers[i]: cells[i].strip() for i in range(len(headers))}
            if any(v.strip() for v in row_dict.values()):
                rows_data.append(row_dict)

        print(f"[Ecount] {menu.value} 데이터 {len(rows_data)}행 추출 완료")
        return rows_data

    except Exception as e:
        print(f"[Ecount] 테이블 추출 실패 ({menu.value}): {e}")
        return rows_data


# ──────────────────────────────────────────────
# 날짜 범위 필터 적용
# ──────────────────────────────────────────────
async def _apply_date_filter(page: Page, date_from: str, date_to: str) -> None:
    """
    날짜 필터: 이카운트 커스텀 드롭다운 + input 제어.

    확정 구조 (2026-04-16 DevTools 검증):
      - UI는 top page document에 렌더링 (s_page iframe은 about:blank 빈 컨테이너).
      - 년 버튼: <button.btn-selectbox data-id="year"> × 2 (DOM 순서: 시작, 종료)
      - 월 버튼: <button.btn-selectbox data-id="month"> × 2
      - 일 입력: <input#day> × 2 (value="01" / "16" 등 직접 텍스트)
      - 팝업: <ul.dropdown-menu.show.dropdown-menu-selectbox>
              > <li><a>2026</a></li> ... (data-value 없음, 텍스트 매칭 필수)
      - 현재 선택 항목: <li class="... active checked-item">
      - 검색: "검색(F8)" 버튼 또는 F8 키

    date_from/date_to: "YYYY-MM-DD" 포맷.
    """
    try:
        y1, m1, d1 = date_from.split("-")
        y2, m2, d2 = date_to.split("-")

        await page.wait_for_load_state("domcontentloaded", timeout=10000)

        # ── 커스텀 드롭다운 컴포넌트 등장 polling ──
        # [최적화] 최대 20s(40×0.5s) -> 10s(40×0.25s) / 감지 빈도 2배로 빠른 성공 체감 향상
        ready = False
        for _ in range(40):
            try:
                count = await page.evaluate("""() => {
                    const y = document.querySelectorAll('button.btn-selectbox[data-id="year"]').length;
                    const m = document.querySelectorAll('button.btn-selectbox[data-id="month"]').length;
                    const d = document.querySelectorAll('input#day').length;
                    return { y, m, d };
                }""")
                if count["y"] >= 2 and count["m"] >= 2 and count["d"] >= 2:
                    ready = True
                    print(f"[Ecount] 날짜 컴포넌트 감지 - year={count['y']} month={count['m']} day={count['d']}")
                    break
            except Exception:
                pass
            await asyncio.sleep(0.25)

        if not ready:
            print("[Ecount] [WARN] 날짜 컴포넌트 타임아웃 - 필터 스킵")
            return

        # ── 드롭다운 1개 선택 헬퍼 ──
        async def _pick_dropdown(data_id: str, index: int, target_text: str) -> bool:
            """
            button.btn-selectbox[data-id=...] N번째 클릭 -> 팝업에서 target_text 항목 클릭.

            Args:
                data_id: "year" or "month"
                index:   0=시작, 1=종료
                target_text: 팝업에서 찾을 텍스트 (예: "2024", "01")

            Returns:
                성공 여부
            """
            label = f"{data_id}[{index}]->{target_text}"
            try:
                btn_locator = page.locator(
                    f'button.btn-selectbox[data-id="{data_id}"]'
                ).nth(index)

                # [최적화] 일치 시 즉시 반환 (추가 대기·클릭 없이 순수 skip) - 이미 올바른 값이면 I/O 0회
                current = (await btn_locator.locator('.selectbox-label').inner_text()).strip()
                if current == target_text:
                    print(f"[Ecount] {label} 이미 {current} 상태 -> skip")
                    return True

                await btn_locator.click()
                # [최적화] 팝업 오픈 대기 0.4s -> 0.2s
                await asyncio.sleep(0.2)

                # 열린 팝업(dropdown-menu.show) 안에서 텍스트 매칭 <a> 클릭
                # dropdown-menu-selectbox 클래스로 다른 드롭다운과 구분
                # 팝업은 동시에 여러 개 show 될 수 없으므로 show 상태인 것 하나만
                clicked = await page.evaluate(
                    """([txt]) => {
                        const popups = [...document.querySelectorAll(
                            'ul.dropdown-menu.show.dropdown-menu-selectbox'
                        )];
                        // offsetParent로 실제 가시성 확인
                        const visible = popups.find(p => p.offsetParent !== null);
                        if (!visible) return { ok: false, reason: 'no-visible-popup' };

                        // <li><a>{txt}</a></li> 매칭
                        const anchors = [...visible.querySelectorAll('li > a')];
                        const hit = anchors.find(a => (a.innerText || '').trim() === txt);
                        if (!hit) {
                            return {
                                ok: false,
                                reason: 'no-matching-item',
                                available: anchors.map(a => a.innerText.trim()).slice(0, 12),
                            };
                        }
                        hit.click();
                        return { ok: true };
                    }""",
                    [target_text],
                )

                if not clicked.get("ok"):
                    print(f"[Ecount] {label} 실패: {clicked}")
                    # 팝업 닫기 (ESC) 후 다음으로
                    await page.keyboard.press("Escape")
                    return False

                # [최적화] 선택 후 반영 대기 0.3s -> 0.15s
                await asyncio.sleep(0.15)
                print(f"[Ecount] {label} 선택 완료 (이전: {current})")
                return True

            except Exception as e:
                print(f"[Ecount] {label} 예외: {e}")
                try:
                    await page.keyboard.press("Escape")
                except Exception:
                    pass
                return False

        # ── 일(day) input 설정 헬퍼 ──
        async def _set_day(index: int, target_day: str) -> bool:
            """
            <input#day> (중복 id!) N번째에 값 주입.
            커스텀 컴포넌트라 fill만으로 state 반영 안 될 수 있어
            focus -> 전체선택 -> type -> blur 순서로 처리.
            """
            label = f"day[{index}]->{target_day}"
            try:
                locator = page.locator('input#day').nth(index)

                # [최적화] 일치 시 즉시 반환 - 추가 focus/type 없이 순수 skip
                current = (await locator.input_value()).strip()
                if current == target_day:
                    print(f"[Ecount] {label} 이미 {current} 상태 -> skip")
                    return True

                await locator.click()
                # [최적화] click 이후 포커스 안정화 sleep 0.1s 제거 (click이 이미 동기 완료)
                await locator.press("ControlOrMeta+A")
                # [최적화] type 문자당 delay 40ms -> 15ms (2자리 입력: 80ms -> 30ms)
                await locator.type(target_day, delay=15)
                await locator.press("Tab")
                # [최적화] blur 반영 대기 0.2s -> 0.1s
                await asyncio.sleep(0.1)
                print(f"[Ecount] {label} 완료 (이전: {current})")
                return True

            except Exception as e:
                print(f"[Ecount] {label} 예외: {e}")
                return False

        # ── 순차 적용: 시작 Y/M/D -> 종료 Y/M/D ──
        # 일을 먼저 바꾸면 유효하지 않은 조합(예: 2월 31일)으로 UI가 reset 할 수 있음.
        # -> 년/월 먼저 확정 후 일 설정하는 순서로 안전하게.
        await _pick_dropdown("year",  0, y1)
        await _pick_dropdown("month", 0, m1)
        await _pick_dropdown("year",  1, y2)
        await _pick_dropdown("month", 1, m2)
        await _set_day(0, d1)
        await _set_day(1, d2)

        # [최적화] 검색 직전 정착 대기 0.5s -> 0.2s
        await asyncio.sleep(0.2)

        # ── 검색 실행 ──
        search_clicked = False
        try:
            result = await page.evaluate("""() => {
                // 1) 검색(F8) 텍스트를 가진 버튼/앵커
                const candidates = [...document.querySelectorAll(
                    'button, a, div[role="button"], span[role="button"]'
                )];
                const btn = candidates.find(b => {
                    const t = (b.innerText || '').trim();
                    return t === '검색(F8)' || t.startsWith('검색(F8)');
                });
                if (btn) { btn.click(); return '검색(F8)'; }

                // 2) id="header_search" 폴백
                const byId = document.getElementById('header_search');
                if (byId) { byId.click(); return 'header_search'; }

                return null;
            }""")
            if result:
                search_clicked = True
                print(f"[Ecount] 검색 버튼 클릭: {result}")
        except Exception as e:
            print(f"[Ecount] 검색 버튼 탐색 예외: {e}")

        if not search_clicked:
            await page.keyboard.press("F8")
            print("[Ecount] F8로 검색 실행 (폴백)")

        # [최적화] 검색 후 grid 렌더 대기 5.0s -> 2.0s (약 -3.0s)
        await asyncio.sleep(2.0)
        print(f"[Ecount] 날짜 필터 적용 완료 ({date_from} ~ {date_to})")

    except Exception as e:
        print(f"[Ecount] 날짜 필터 설정 실패: {e}")


# ──────────────────────────────────────────────
# 생산입고조회: 메뉴 URL만으로 화면 오픈 -> 검색·날짜 없이 엑셀 다운로드
# 엑셀 셀렉터 추가: .env ECOUNT_EXCEL_EXTRA_SELECTORS=셀1,셀2 (Playwright selector 문법)
# ──────────────────────────────────────────────
PRODUCTION_RECEIPT_HEADER_MAP: dict[str, str] = {
    "입고번호": "receipt_no",
    "입고일자": "doc_date",
    "일자": "doc_date",
    "생산입고공장명": "factory_name",
    "받는창고명": "warehouse_name",
    "품목": "product_name",
    "수량": "qty",
    "작업지시서": "work_order",
}

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


def _excel_selectors_for_download() -> list[str]:
    """사용자 지정 셀렉터를 앞에 붙여 먼저 시도(버튼 위치가 특이할 때)."""

    raw = (os.getenv("ECOUNT_EXCEL_EXTRA_SELECTORS") or "").strip()
    extra = [s.strip() for s in raw.split(",") if s.strip()]
    return extra + _EXCEL_BUILTIN_SELECTORS


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


async def _download_excel_bytes(
    page: Page,
    company_code: str,
    menu_value: str,
) -> bytes | None:
    """모든 프레임에서 Excel 버튼 탐색 후 다운로드 바이트 반환."""

    try:
        await page.wait_for_load_state("networkidle", timeout=15000)
    except Exception:
        pass

    for attempt in range(40):
        ready = False
        for fr in page.frames:
            try:
                if await fr.evaluate(_EXCEL_BTN_PROBE_JS):
                    ready = True
                    break
            except Exception:
                continue
        if ready:
            break
        await asyncio.sleep(0.3)
    if not ready:
        print("[Ecount] [WARN] 엑셀 버튼 DOM 대기 타임아웃 - 클릭 시도는 계속")

    selectors = _excel_selectors_for_download()
    try:
        async with page.expect_download(timeout=60_000) as dl_info:
            clicked = False
            for fr in page.frames:
                for sel in selectors:
                    try:
                        loc = fr.locator(sel).first
                        if await loc.count() > 0 and await loc.is_visible():
                            await loc.click(timeout=3000)
                            clicked = True
                            print(f"[Ecount] 엑셀 클릭: {sel}")
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
                    if (hit) { hit.click(); return true; }
                    hit = cands.find(el => {
                        if (!visible(el)) return false;
                        const t = (el.innerText || el.value || '').trim();
                        return t.includes('Excel') || t.includes('엑셀');
                    });
                    if (hit) { hit.click(); return true; }
                    return false;
                }"""
                for fr in page.frames:
                    try:
                        if await fr.evaluate(_click_js):
                            clicked = True
                            print("[Ecount] 엑셀 클릭(JS)")
                            break
                    except Exception:
                        continue
            if not clicked:
                print("[Ecount] [WARN] 엑셀 버튼 미발견")
                return None

        download: Download = await dl_info.value
        path = await download.path()
        if not path:
            return None
        with open(path, "rb") as f:
            data = f.read()
        print(f"[Ecount] 엑셀 다운로드 완료: {len(data):,} bytes")

        try:
            save_dir = os.path.join(
                os.path.dirname(os.path.abspath(__file__)), "storage", "excel"
            )
            os.makedirs(save_dir, exist_ok=True)
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            ext = "csv" if data[:4] != b"PK\x03\x04" else "xlsx"
            save_path = os.path.join(
                save_dir, f"{company_code}_{menu_value}_{ts}.{ext}"
            )
            with open(save_path, "wb") as wf:
                wf.write(data)
            print(f"[Ecount] 원본 저장: {save_path}")
        except Exception as e:
            print(f"[Ecount] 원본 파일 저장 실패(무시): {e}")

        return data
    except Exception as e:
        print(f"[Ecount] 엑셀 다운로드 실패: {e}")
        return None


def _normalize_production_receipt_xlsx(
    raw: bytes,
    company_code: str,
    date_from: str,
    date_to: str,
) -> list[dict[str, object]]:
    """생산입고조회 엑셀 -> Supabase 적재용 행."""

    if not raw or raw[:4] != b"PK\x03\x04":
        print("[Ecount] [WARN] 생산입고조회: XLSX가 아니거나 빈 파일")
        return []

    header_keys_norm = {"".join(k.split()) for k in PRODUCTION_RECEIPT_HEADER_MAP}
    sheet = pd.read_excel(io.BytesIO(raw), header=None, engine="openpyxl")
    header_row_idx = None
    for i in range(min(len(sheet), 30)):
        row_norm = {
            "".join(str(v).split())
            for v in sheet.iloc[i].tolist()
            if pd.notna(v) and str(v).strip()
        }
        hits = len(row_norm & header_keys_norm)
        if hits >= 2:
            header_row_idx = i
            break
    if header_row_idx is None:
        print("[Ecount] [WARN] 생산입고조회 엑셀 헤더 행 탐지 실패")
        return []

    df = pd.read_excel(
        io.BytesIO(raw),
        header=header_row_idx,
        engine="openpyxl",
    )
    df.columns = [str(c).strip() for c in df.columns]

    def _hn(s: object) -> str:
        return "".join(str(s).split())

    norm_to_actual = {_hn(c): c for c in df.columns}
    rename: dict[str, str] = {}
    for src, dst in PRODUCTION_RECEIPT_HEADER_MAP.items():
        key = _hn(src)
        if key in norm_to_actual:
            rename[norm_to_actual[key]] = dst
    if not rename:
        print("[Ecount] [WARN] 생산입고조회: 매칭된 컬럼 없음")
        return []

    df = df[list(rename.keys())].rename(columns=rename)
    # 변경 이유: 생산입고조회의 일자별 집계를 위해 doc_date를 항상 생성/정규화합니다.
    if "doc_date" not in df.columns and "receipt_no" in df.columns:
        extracted = (
            df["receipt_no"]
            .astype(str)
            .str.extract(r"^(?P<date>\d{2,4}[/-]\d{1,2}[/-]\d{1,2})")
        )
        df["doc_date"] = extracted["date"]

    if "doc_date" in df.columns:
        parsed = pd.to_datetime(
            df["doc_date"].astype(str).str.strip().str.replace(".", "/", regex=False),
            errors="coerce",
            format="%Y/%m/%d",
        )
        parsed_alt = pd.to_datetime(
            df["doc_date"].astype(str).str.strip().str.replace(".", "/", regex=False),
            errors="coerce",
            format="%y/%m/%d",
        )
        df["doc_date"] = parsed.fillna(parsed_alt)
        df = df.dropna(subset=["doc_date"]).copy()
        df["doc_date"] = df["doc_date"].dt.strftime("%Y-%m-%d")

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
        df = df[df["receipt_no"].astype(str).str.strip() != ""].copy()

    df = df.where(pd.notna(df), None)
    out: list[dict[str, object]] = []
    for rec in df.to_dict(orient="records"):
        row: dict[str, object] = {}
        for k, v in rec.items():
            if hasattr(v, "item"):
                try:
                    val = v.item()
                    if isinstance(val, float) and pd.isna(val):
                        val = None
                    row[str(k)] = val
                except Exception:
                    row[str(k)] = None
            else:
                row[str(k)] = v
        out.append(row)
    print(f"[Ecount] 생산입고조회 정규화: {len(out)}행")
    return out


async def _replace_production_receipt_rows(
    supabase: Client,
    table_name: str,
    records: list[dict[str, object]],
    company_code: str,
    date_from: str,
    date_to: str,
) -> dict[str, object]:
    """동일 기업·조회기간 데이터 삭제 후 재삽입."""

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
        deleted = int(getattr(del_res, "count", None) or 0)
        print(f"[Supabase] {table_name} 기간별 삭제: {deleted}행")
    except Exception as e:
        logger.error("supabase_delete_failed", table=table_name, error=str(e))
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
        logger.error("supabase_insert_failed", table=table_name, error=str(e))
        return {"inserted": total, "deleted": deleted, "error": f"insert: {e}"}


# ──────────────────────────────────────────────
# 메인 크롤링 로직
# ──────────────────────────────────────────────
async def _crawl(
    menu: str,
    date_from: str,
    date_to: str,
    cookie_path: str,
    credentials: dict,
) -> dict[str, object]:
    """
    실제 크롤링 로직. 별도 프로세스 안에서만 호출.
    xhs/crawler.py의 2단계 headless 전환 패턴 적용.
    """
    menu_enum = EcountMenu(menu)
    results: list[dict] = []

    async with async_playwright() as p:
        print(f"\n[Ecount] '{menu_enum.value}' 크롤링 시작 ({date_from} ~ {date_to})")

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

        # 저장된 쿠키가 있으면 로드 (빈 파일·손상 JSON은 제외 -> 재로그인 경로)
        ssp = _playwright_storage_state_path_or_none(cookie_path)
        if ssp:
            context_kwargs["storage_state"] = ssp
            print(f"[Ecount] 쿠키 로드: {ssp}")

        # ── 1단계: Headless=True로 세션 유효성 확인 ──
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(**context_kwargs)
        page = await context.new_page()

        session_valid = await _check_session(page)

        if not session_valid:
            print("[Ecount] 세션 만료 감지 -> 재로그인 필요")
            await browser.close()

            # ── 2단계: Headless=False로 재시작 -> 로그인 수행 ──
            # 자동 로그인 시도 (크리덴셜 있는 경우)
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
                login_success = await _login(page, credentials)
                if login_success:
                    break
                print(f"[Ecount] 자동 로그인 재시도: {attempt + 1}/2 실패")
                await asyncio.sleep(0.8)

            if login_success:
                # 세션 쿠키 저장
                os.makedirs(os.path.dirname(cookie_path), exist_ok=True)
                await context.storage_state(path=cookie_path)
                print(f"[Ecount] 세션 쿠키 저장 완료: {cookie_path}")
            else:
                # 변경 이유: ProcessPool 자식 프로세스에서 input()은 EOFError를 유발하므로 즉시 명확한 오류를 반환합니다.
                raise RuntimeError(
                    "[Ecount] 자동 로그인 실패. .env 자격증명(ECOUNT_*_COM_CODE/USER_ID/USER_PW)과 "
                    "보안문자/2차인증 유무를 확인하세요. 필요하면 쿠키 파일을 삭제 후 재실행하세요."
                )
        else:
            print("[Ecount] 세션 유효 -> Headless 유지")

        # ── 3단계: 대상 메뉴 접근 및 데이터 추출 ──
        try:
            # 기업별 메뉴 트리(해시)가 다를 수 있어 env로 오버라이드 가능 - resolve_menu_navigation
            nav = resolve_menu_navigation(menu_enum, credentials)
            prg_id = (nav.get("prg_id") or "").strip()
            if not prg_id:
                extra = ""
                if menu_enum == EcountMenu.생산입고조회:
                    extra = (
                        " 생산입고조회: ERP 주소창 #prgId= 확인 후 "
                        "예) ECOUNT_GL_PRODUCTION_RECEIPT_PRG_ID 설정."
                    )
                raise ValueError(
                    f"prgId 미설정: {menu_enum.value} - MENU_PRG_ID 또는 "
                    f"기업접두사_메뉴블록_PRG_ID(.env)를 확인하세요.{extra}"
                )

            # 현재 page.url에서 base + ec_req_sid 추출
            # ex) https://loginab.ecount.com/ec5/view/erp?w_flag=1&ec_req_sid=AB-XXX#...
            current_url = page.url
            base_url = "/".join(current_url.split("/")[:3])  # https://loginab.ecount.com

            # ec_req_sid 파싱 (쿼리스트링에서 추출)
            from urllib.parse import urlparse, parse_qs
            parsed = urlparse(current_url)
            qs = parse_qs(parsed.query)
            ec_req_sid = qs.get("ec_req_sid", [""])[0]

            if not ec_req_sid:
                erp_main = f"{base_url}/ec5/view/erp"
                print(f"[Ecount] ec_req_sid 없음 -> ERP 메인 경유: {erp_main}")
                try:
                    await page.goto(
                        erp_main, wait_until="domcontentloaded", timeout=30000
                    )
                    parsed2 = urlparse(page.url)
                    ec_req_sid = parse_qs(parsed2.query).get("ec_req_sid", [""])[0]
                    base_url = "/".join(page.url.split("/")[:3])
                except Exception as e:
                    print(f"[Ecount] ERP 메인 진입 실패: {e}")

            if not ec_req_sid:
                raise RuntimeError(
                    "ec_req_sid 획득 실패 - 로그인 후 ERP 세션 URL을 확인하세요."
                )

            # 타겟 URL 구성 - 이카운트 메뉴 네비게이션 전체 컨텍스트 필요
            menu_type = nav["menu_type"]
            menu_seq = nav["menu_seq"]
            group_seq = nav["group_seq"]
            depth = nav["depth"]
            target_url = (
                f"{base_url}/ec5/view/erp"
                f"?w_flag=1&ec_req_sid={ec_req_sid}"
                f"#menuType={menu_type}&menuSeq={menu_seq}"
                f"&groupSeq={group_seq}&prgId={prg_id}&depth={depth}"
            )

            print(f"[Ecount] 접속 중: {target_url}")
            await page.goto(target_url, wait_until="domcontentloaded", timeout=30000)

            # ── s_page iframe이 실제 컨텐츠로 navigate될 때까지 polling ──
            # 이카운트는 SPA 해시 라우팅이라 goto 직후엔 s_page가 about:blank 상태.
            # 실제 메뉴 컨텐츠가 iframe에 주입될 때까지 기다려야 select를 찾을 수 있다.
            # [최적화] iframe polling 최대 30s(60×0.5s) -> 10s(40×0.25s) - 폴링 간격 짧게, 총 대기 단축
            print(f"[Ecount] s_page iframe 실제 로드 대기 중...")
            iframe_loaded = False
            for attempt in range(40):
                s_page = page.frame(name="s_page")
                if s_page is not None:
                    frame_url = s_page.url or ""
                    if frame_url and frame_url != "about:blank":
                        try:
                            has_content = await s_page.evaluate("""() => {
                                const selectCount = document.querySelectorAll('select').length;
                                const bodyText = (document.body && document.body.innerText) || '';
                                return selectCount >= 3
                                    || bodyText.includes('기준일자')
                                    || bodyText.includes('생산입고')
                                    || bodyText.includes('입고번호');
                            }""")
                            if has_content:
                                iframe_loaded = True
                                print(f"[Ecount] s_page 로드 완료 ({attempt * 0.25:.1f}s) | url={frame_url[:80]}")
                                break
                        except Exception:
                            pass
                await asyncio.sleep(0.25)

            if not iframe_loaded:
                print(f"[Ecount] [WARN] s_page 컨텐츠 로드 타임아웃 - 진행은 계속")

            # [최적화] 렌더 안정화 1.5s -> 0.6s
            await asyncio.sleep(0.6)

            if menu_enum == EcountMenu.생산입고조회:
                print(
                    "[Ecount] 생산입고조회: URL 로드만으로 엑셀 사용 가능 가정 - "
                    "검색·날짜 조작 생략"
                )
                cc = str(credentials.get("company_code") or "unknown")
                xlsx_bytes = await _download_excel_bytes(page, cc, menu_enum.value)
                return {"extractor": "excel", "bytes": xlsx_bytes}

            # 날짜 필터 적용 (구매/판매 등 DOM 추출 메뉴)
            await _apply_date_filter(page, date_from, date_to)

            # 데이터 추출
            results = await _extract_table_data(page, menu_enum)

            # 메타데이터 추가
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

    print(f"[Ecount] 완료 - {len(results)}행 반환")
    return {"extractor": "table", "rows": results}


# ──────────────────────────────────────────────
# Supabase 저장 헬퍼
# ──────────────────────────────────────────────
async def _save_to_supabase(
    data: list[dict],
    table_name: str,
    supabase: Client,
) -> dict:
    """
    추출된 데이터를 Supabase 테이블에 upsert.
    중복 방지: 동일 날짜 범위 기존 데이터 삭제 후 insert (replace 방식).
    """
    if not data:
        return {"inserted": 0, "error": None}

    try:
        # 배치 사이즈로 나눠서 insert (Supabase 단일 요청 제한 고려)
        BATCH_SIZE = 100
        total_inserted = 0

        for i in range(0, len(data), BATCH_SIZE):
            batch = data[i : i + BATCH_SIZE]
            response = supabase.table(table_name).upsert(batch).execute()
            total_inserted += len(batch)
            print(f"[Supabase] {table_name}: {total_inserted}/{len(data)}행 저장 완료")

        return {"inserted": total_inserted, "error": None}

    except Exception as e:
        logger.error("supabase_save_failed", table=table_name, error=str(e))
        return {"inserted": 0, "error": str(e)}


# ──────────────────────────────────────────────
# 메인 크롤러 클래스
# ──────────────────────────────────────────────
class EcountCrawler:
    """
    이카운트 ERP 크롤러.
    FastAPI/uvicorn 환경에서 안전하게 실행되도록
    ProcessPoolExecutor로 Playwright를 별도 프로세스에서 구동.
    """

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
        # 변경 이유: 테스트용(--no-db) 실행 시에도 Supabase client 생성으로 인한 실패를 방지합니다.
        self.supabase: Client | None = None
        if SUPABASE_URL and SUPABASE_KEY:
            self.supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    async def crawl_and_save(
        self,
        menu: EcountMenu,
        date_from: str | None = None,  # 기본값: "2024-01-01"
        date_to: str | None = None,    # 기본값: 오늘 (YYYY-MM-DD)
        save_to_db: bool = True,
        company: str | EcountCompanyCode | None = None,
    ) -> dict:
        """
        지정된 메뉴 데이터를 크롤링하고 Supabase에 저장.
        company 가 있으면 해당 기업 자격증명·쿠키로 이번 호출만 실행(인스턴스 기본 기업은 유지).

        Returns:
            {
                "menu": str,
                "rows": list[dict],
                "inserted": int,
                "error": str | None
            }
        """
        import concurrent.futures

        # 기본 날짜: 시작 2024-01-01, 종료 오늘
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

        clabel = str(run_credentials.get("company_label") or effective_code)
        print(f"\n{'='*50}")
        print(
            f"[EcountCrawler] 시작: {clabel} ({effective_code}) | {menu.value} | "
            f"{date_from} ~ {date_to}"
            + (" [company 오버라이드]" if company is not None else "")
        )
        print(f"{'='*50}")

        # ProcessPoolExecutor로 별도 프로세스 실행
        with concurrent.futures.ProcessPoolExecutor(max_workers=1) as executor:
            raw_payload = await loop.run_in_executor(
                executor,
                _run_in_new_process,
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
                rows = _normalize_production_receipt_xlsx(
                    bytes(blob), effective_code, date_from, date_to
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

        # Supabase 저장
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
                save_result = await _replace_production_receipt_rows(
                    self.supabase,
                    table_name,
                    rows,
                    effective_code,
                    date_from,
                    date_to,
                )
            else:
                save_result = await _save_to_supabase(
                    rows, table_name, self.supabase
                )
            result["inserted"] = int(save_result.get("inserted", 0) or 0)
            result["error"] = save_result.get("error")

        return result

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
            # [최적화] 메뉴 간 딜레이 3~6s -> 1~2s (서버 부하는 여전히 존중)
            await asyncio.sleep(random.uniform(1.0, 2.0))

        return results


# ──────────────────────────────────────────────
# CLI 실행 (직접 테스트용)
# python ecount_crawler.py --menu purchase --company glpharm --from 2025-01-01 --to 2025-12-31
# python ecount_crawler.py --menu purchase --company all --no-db
# ──────────────────────────────────────────────
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
    # 기본: 2024-01-01 ~ 오늘
    parser.add_argument("--from", dest="date_from", default="2024-01-01",
                        help="시작 일자 YYYY-MM-DD (기본: 2024-01-01)")
    parser.add_argument("--to",   dest="date_to",
                        default=datetime.now().strftime("%Y-%m-%d"),
                        help="종료 일자 YYYY-MM-DD (기본: 오늘)")
    parser.add_argument(
        "--company",
        default="glpharm",
        help=(
            f"기업 코드 ({', '.join(known_company_codes)}) 또는 all - "
            "all 이면 COM/USER/PW가 모두 설정된 기업만 순차 크롤링"
        ),
    )
    parser.add_argument("--no-db", action="store_true", help="DB 저장 스킵 (테스트용)")
    parser.add_argument("--debug", action="store_true", help="디버그 로그 출력")
    args = parser.parse_args()

    # --debug 플래그 -> 환경변수에 세팅 (자식 프로세스에도 전파)
    if args.debug:
        os.environ["ECOUNT_DEBUG"] = "1"

    menu_enum = EcountMenu(args.menu)

    async def main() -> None:
        if args.company.strip().lower() == "all":
            targets = list_configured_company_codes()
            if not targets:
                print(
                    "[Ecount] --company all 이지만 순회할 기업이 없습니다. "
                    "각 ECOUNT_XX_COM_CODE / USER_ID / USER_PW 를 .env.local에 설정하세요."
                )
                return
            print(f"[Ecount] --company all -> 자격증명이 있는 기업: {targets}")
        else:
            targets = [args.company.strip().lower()]

        for code in targets:
            print(f"\n{'#'*50}\n[Ecount] 기업: {code}\n{'#'*50}")
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