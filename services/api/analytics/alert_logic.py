"""
시즌 시작·종료, 한파 특보, 폭염 특보(feature flag) 알림 조립.

폭염은 기본 비활성; 여름 상품 존재 시 활성화 가능한 구조만 제공.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pandas as pd


@dataclass
class AlertFeatureFlags:
    """TODO: config/feature_flags.yaml에서 로드."""

    summer_mode: bool = False
    summer_sku_exists: bool = False
    show_heatwave_alert: bool = False

    def resolved_show_heatwave(self) -> bool:
        """요구사항: summer_mode 및 summer_sku_exists 등을 반영해 폭염 UI 노출 여부 결정."""
        # TODO: 운영 규칙 최종 확정 (현재는 플래그 조합만 노출, 임의 임계 로직 없음)
        return bool(self.show_heatwave_alert and self.summer_mode and self.summer_sku_exists)


def detect_coldwave_alerts(
    flags: pd.Series,
    *,
    date_col: str,
    sku_col: str | None = None,
) -> list[dict[str, Any]]:
    """
    한파 특보 알림(항목 11 방향).

    Args:
        flags: 행 단위 한파 특보 여부(이미 통합 테이블에 coldwave_flag로 존재한다고 가정).
    TODO: 특보 발효·해제 시각, 지역 매핑, SKU 연관 규칙 확정.
    """
    _ = (date_col, sku_col)
    alerts: list[dict[str, Any]] = []
    # TODO: flags True인 날짜·지역 집합을 알림 객체로 변환
    return alerts


def detect_heatwave_alerts(
    ff: AlertFeatureFlags,
    flags: pd.Series,
    *,
    date_col: str,
) -> list[dict[str, Any]]:
    """폭염 특보: feature flag가 꺼져 있으면 빈 리스트."""
    if not ff.resolved_show_heatwave():
        return []
    _ = (flags, date_col)
    # TODO: 폭염 특보 소스 필드 연결
    return []


def detect_season_boundaries(
    df: pd.DataFrame,
    *,
    date_col: str,
    sku_col: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """
    시즌 시작·종료 이벤트.

    TODO: insight.html 및 사업팀 규칙에 따른 임계·이동평균·룰 확정 전까지 빈 리스트 반환.
    """
    _ = (df, date_col, sku_col)
    return [], []


def build_alert_feed(
    df: pd.DataFrame,
    ff: AlertFeatureFlags,
    *,
    date_col: str,
    sku_col: str,
    coldwave_flag_col: str,
) -> list[dict[str, Any]]:
    """대시보드 alerts 배열용 단일 진입점."""
    alerts: list[dict[str, Any]] = []
    alerts.extend(detect_coldwave_alerts(df[coldwave_flag_col], date_col=date_col, sku_col=sku_col))
    alerts.extend(detect_heatwave_alerts(ff, df.get("heatwave_flag", pd.Series(False, index=df.index)), date_col=date_col))
    starts, ends = detect_season_boundaries(df, date_col=date_col, sku_col=sku_col)
    alerts.extend(starts)
    alerts.extend(ends)
    return alerts
