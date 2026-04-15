"""
추가 마케팅 데이터(통합 예정) 로더.

최소 컬럼 예시는 요구사항에 명시됨. 실제 저장 포맷(CSV/DB) 확정 전까지 경로·매핑은 TODO.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd


def load_marketing_campaigns(
    path: Path,
    column_map: dict[str, str] | None = None,
    *,
    read_kw: dict[str, Any] | None = None,
) -> pd.DataFrame:
    """
    마케팅 캠페인 일별×SKU 데이터 적재.

    논리 스키마(요구사항 예시):
        date, sku, campaign_name, marketing_on, marketing_type,
        spend, impressions, clicks, orders_from_ad, coupon_on

    Args:
        column_map: 원본->논리 컬럼명. None이면 TODO: 표준 논리명과 동일한 헤더를 가정(검증만).
    """
    read_kw = read_kw or {}
    suf = path.suffix.lower()
    if suf == ".csv":
        df = pd.read_csv(path, **read_kw)
    elif suf in {".xlsx", ".xls"}:
        df = pd.read_excel(path, **read_kw)
    else:
        raise ValueError("TODO: 마케팅 데이터 저장 포맷 확정")

    if column_map:
        missing = [c for c in column_map if c not in df.columns]
        if missing:
            raise KeyError(f"TODO: 마케팅 원본 컬럼 누락: {missing}")
        df = df.rename(columns=column_map)

    # TODO: 필수 논리 컬럼 존재 여부 검증 (소스 확정 후 REQUIRED 컬럼 집합 정의)
    return df
