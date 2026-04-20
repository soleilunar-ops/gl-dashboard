"""
Ecount 런타임 기업/설정 모듈.
변경 이유: 기업 설정과 공통 상수를 분리해 런타임 코어 파일 길이를 줄입니다.
"""

from __future__ import annotations

import os
from enum import Enum
from urllib.parse import parse_qsl

# scripts/ -> 한 단계 위가 프로젝트 루트(gl-dashboard/)
# 프로젝트 루트의 .env.local에서 환경변수 로드
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


class EcountMenu(str, Enum):
    """Ecount 메뉴. 생산입고조회는 메뉴 URL 진입 후 엑셀만 받아 pandas 정규화."""

    구매현황 = "purchase"
    판매현황 = "sales"
    생산입고조회 = "production_receipt"


class EcountCompanyCode(str, Enum):
    """대시보드 orderMeta.ts ORDER_COMPANIES.code 와 동일한 기업 코드."""

    gl = "gl"
    glpharm = "glpharm"
    hnb = "hnb"


TABLE_MAP = {
    EcountMenu.구매현황: "ecount_purchase",
    EcountMenu.판매현황: "ecount_sales",
    EcountMenu.생산입고조회: "ecount_production_receipt",
}

MENU_PRG_ID = {
    EcountMenu.구매현황: "E040305",
    EcountMenu.판매현황: "E040207",
    EcountMenu.생산입고조회: "",
}

_PRODUCTION_RECEIPT_NAV_BASE: dict[str, str] = {
    "menu_type": "MENUTREE_000004",
    "menu_seq": "MENUTREE_000215",
    "group_seq": "MENUTREE_000035",
    "prg_id": "",
    "depth": "4",
}

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
    # 변경 이유: .env 에 menuType=...&menuSeq=... 형태 단일 문자열을 넣어도 파싱해 반영합니다.
    packed = (os.getenv(f"{prefix}_{block}") or "").strip()
    if packed:
        normalized = (
            packed.replace("#", "&")
            .replace("?", "&")
            .replace(" ", "")
        )
        parsed: dict[str, str] = {}
        for key, value in parse_qsl(normalized, keep_blank_values=True):
            k = key.strip()
            v = value.strip()
            if not k or not v:
                continue
            parsed[k] = v
        key_map = {
            "menuType": "menu_type",
            "menuSeq": "menu_seq",
            "groupSeq": "group_seq",
            "prgId": "prg_id",
            "depth": "depth",
        }
        for src_key, dst_key in key_map.items():
            if src_key in parsed and parsed[src_key]:
                result[dst_key] = parsed[src_key]

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


def remove_cookie_file(cookie_path: str) -> None:
    """
    변경 이유: 실행할 때마다 신규 로그인을 강제하기 위해 기존 쿠키를 삭제합니다.
    """
    try:
        if os.path.isfile(cookie_path):
            os.remove(cookie_path)
            print(f"[Ecount] 기존 쿠키 삭제: {cookie_path}")
    except Exception as e:
        print(f"[Ecount] 쿠키 삭제 실패(무시): {e}")
