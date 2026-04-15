"""
기상청(공공데이터포털) API 전용 모듈.

역할:
  - ECMWF·Open-Meteo 등과 분리해, data.go.kr 디코딩 키(KMA_API_KEY)만 쓰는 호출을 한곳에 모은다.
  - 엔드포인트 URL·서비스명·요청 파라미터 규격은 기상청 문서를 기준으로 유지한다.

환경 변수:
  - KMA_API_KEY: .env 또는 OS 환경 (레포에 커밋하지 않음)

구현 상태:
  - ASOS 일·시간: 조회 + 응답 정규화 골격
  - 단기·중기·수치모델·특보: URL·파라미터 시그니처만 두고, 파싱·검증은 TODO

변경 이유: 기상청 API만 별도 파일로 모아 확장·테스트 경로를 명확히 하기 위함
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Literal

import httpx
import pandas as pd

# ---------------------------------------------------------------------------
# 엔드포인트 (기상청_지상·단기·중기·수치모델·특보 — 공공데이터포털 명칭 기준)
# ---------------------------------------------------------------------------
KMA_HOST = "https://apis.data.go.kr/1360000"

# 지상(종관, ASOS)
ASOS_DAILY_URL = f"{KMA_HOST}/AsosDalyInfoService/getWthrDataList"
ASOS_HOURLY_URL = f"{KMA_HOST}/AsosHourlyInfoService/getWthrDataList"

# 단기예보 (격자: nx, ny)
VILAGE_ULTRA_SHORT_NCST_URL = f"{KMA_HOST}/VilageFcstInfoService_2.0/getUltraSrtNcst"

# 중기예보 (예보구역 stnId, 발표시각 tmFc)
MID_FCST_URL = f"{KMA_HOST}/MidFcstInfoService/getMidFcst"

# 수치모델(경량화 LDAPS 등)
NWP_LDAPS_UNIS_AREA_URL = f"{KMA_HOST}/NwpModelInfoService/getLdapsUnisArea"

# 기상특보
WTHR_WRN_LIST_URL = f"{KMA_HOST}/WthrWrnInfoService/getWthrWrnList"

DataType = Literal["JSON", "XML"]


def _load_kma_key(explicit: str | None) -> str:
    key = (explicit or os.getenv("KMA_API_KEY", "")).strip()
    if not key:
        raise ValueError(
            "KMA_API_KEY 가 비어 있습니다. 프로젝트 루트 .env 또는 환경 변수에 "
            "기상청 공공데이터 디코딩 키를 설정하세요."
        )
    return key


def _parse_kma_json_items(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """
    response.body.items.item 을 항상 list[dict] 로 맞춘다.
    단일 객체일 때 API는 dict 만 주는 경우가 있다.
    """
    try:
        body = payload["response"]["body"]
    except (KeyError, TypeError) as e:
        preview = repr(payload)[:500]
        raise ValueError(f"TODO: 기상청 응답 body 없음 또는 비표준: {preview}") from e

    items_wrap = body.get("items")
    if items_wrap is None:
        return []

    if isinstance(items_wrap, str):
        # TODO: XML dataType 일 때는 별도 파서
        raise NotImplementedError("TODO: XML 응답은 dataType=JSON 사용 또는 XML 파서 추가")

    item = items_wrap.get("item")
    if item is None:
        return []
    if isinstance(item, list):
        return item
    if isinstance(item, dict):
        return [item]
    return []


def _kma_result_code_message(payload: dict[str, Any]) -> tuple[str, str]:
    """header.resultCode, resultMsg 추출."""
    try:
        h = payload["response"]["header"]
        return str(h.get("resultCode", "")), str(h.get("resultMsg", ""))
    except (KeyError, TypeError):
        return ("UNKNOWN", "")


@dataclass
class KmaHttpConfig:
    """기상청 HTTP 공통 설정."""

    api_key: str | None = None
    timeout_sec: float = 60.0
    # TODO: 일일 트래픽·재시도 정책은 운영 정책 확정 후 반영


@dataclass
class AsosDailyParams:
    """ASOS 일자료 조회 파라미터 (getWthrDataList)."""

    start_dt: str  # YYYYMMDD
    end_dt: str  # YYYYMMDD
    stn_ids: str  # 관측소 번호, 예: "108"
    data_cd: str = "ASOS"
    date_cd: str = "DAY"
    num_of_rows: int = 999
    data_type: DataType = "JSON"


def fetch_asos_daily(
    p: AsosDailyParams,
    *,
    cfg: KmaHttpConfig | None = None,
    client: httpx.Client | None = None,
) -> pd.DataFrame:
    """
    ASOS 일자료를 조회해 행 단위 DataFrame 으로 반환한다.

    한 페이지(기본 numOfRows=999)를 넘기면 TODO: fetch_asos_daily_all 로 페이지 순회.
    """
    cfg = cfg or KmaHttpConfig()
    key = _load_kma_key(cfg.api_key)

    params: dict[str, Any] = {
        "serviceKey": key,
        "pageNo": 1,
        "numOfRows": p.num_of_rows,
        "dataType": p.data_type,
        "dataCd": p.data_cd,
        "dateCd": p.date_cd,
        "startDt": p.start_dt,
        "endDt": p.end_dt,
        "stnIds": p.stn_ids,
    }

    own = client is None
    c = client or httpx.Client(timeout=cfg.timeout_sec)
    try:
        r = c.get(ASOS_DAILY_URL, params=params)
        r.raise_for_status()
        payload = r.json()
    finally:
        if own:
            c.close()

    code, msg = _kma_result_code_message(payload)
    if code != "00":
        raise RuntimeError(f"기상청 API 오류 resultCode={code} resultMsg={msg}")

    rows = _parse_kma_json_items(payload)
    if not rows:
        return pd.DataFrame()

    return pd.DataFrame(rows)


# TODO: 페이지네이션 — totalCount 기준으로 pageNo 증가하며 병합
def fetch_asos_daily_all(
    p: AsosDailyParams,
    *,
    cfg: KmaHttpConfig | None = None,
) -> pd.DataFrame:
    """ASOS 일자료 전 구간(다중 페이지) 수집. TODO: totalCount·pageNo 루프 구현."""
    raise NotImplementedError("TODO: totalCount 확인 후 pageNo 반복 병합")


@dataclass
class AsosHourlyParams:
    """ASOS 시간자료 조회."""

    start_dt: str
    start_hh: str  # 시각 HH
    end_dt: str
    end_hh: str
    stn_ids: str
    data_cd: str = "ASOS"
    date_cd: str = "HR"
    num_of_rows: int = 999
    data_type: DataType = "JSON"


def fetch_asos_hourly(
    p: AsosHourlyParams,
    *,
    cfg: KmaHttpConfig | None = None,
    client: httpx.Client | None = None,
) -> pd.DataFrame:
    """ASOS 시간자료. TODO: 응답 컬럼명·단위 매핑은 피처 파이프라인에서 통일."""
    cfg = cfg or KmaHttpConfig()
    key = _load_kma_key(cfg.api_key)
    params: dict[str, Any] = {
        "serviceKey": key,
        "pageNo": 1,
        "numOfRows": p.num_of_rows,
        "dataType": p.data_type,
        "dataCd": p.data_cd,
        "dateCd": p.date_cd,
        "startDt": p.start_dt,
        "startHh": p.start_hh,
        "endDt": p.end_dt,
        "endHh": p.end_hh,
        "stnIds": p.stn_ids,
    }
    own = client is None
    c = client or httpx.Client(timeout=cfg.timeout_sec)
    try:
        r = c.get(ASOS_HOURLY_URL, params=params)
        r.raise_for_status()
        payload = r.json()
    finally:
        if own:
            c.close()

    code, msg = _kma_result_code_message(payload)
    if code != "00":
        raise RuntimeError(f"기상청 API 오류 resultCode={code} resultMsg={msg}")

    rows = _parse_kma_json_items(payload)
    return pd.DataFrame(rows) if rows else pd.DataFrame()


@dataclass
class VilageUltraShortParams:
    """초단기실황(단기예보 격자)."""

    base_date: str  # YYYYMMDD
    base_time: str  # HHmm
    nx: int
    ny: int
    num_of_rows: int = 1000
    data_type: DataType = "JSON"


def fetch_vilage_ultra_short_ncst(
    p: VilageUltraShortParams,
    *,
    cfg: KmaHttpConfig | None = None,
    client: httpx.Client | None = None,
) -> pd.DataFrame:
    """초단기실황. TODO: 격자(nx,ny)·카테고리별 값 해석은 단기예보 문서 확정 후."""
    cfg = cfg or KmaHttpConfig()
    key = _load_kma_key(cfg.api_key)
    params: dict[str, Any] = {
        "serviceKey": key,
        "pageNo": 1,
        "numOfRows": p.num_of_rows,
        "dataType": p.data_type,
        "base_date": p.base_date,
        "base_time": p.base_time,
        "nx": p.nx,
        "ny": p.ny,
    }
    own = client is None
    c = client or httpx.Client(timeout=cfg.timeout_sec)
    try:
        r = c.get(VILAGE_ULTRA_SHORT_NCST_URL, params=params)
        r.raise_for_status()
        payload = r.json()
    finally:
        if own:
            c.close()

    code, msg = _kma_result_code_message(payload)
    if code != "00":
        raise RuntimeError(f"기상청 API 오류 resultCode={code} resultMsg={msg}")

    rows = _parse_kma_json_items(payload)
    return pd.DataFrame(rows) if rows else pd.DataFrame()


@dataclass
class MidFcstParams:
    """중기예보."""

    stn_id: str
    tm_fc: str  # YYYYMMDDHHmm
    num_of_rows: int = 10
    data_type: DataType = "JSON"


def fetch_mid_fcst(
    p: MidFcstParams,
    *,
    cfg: KmaHttpConfig | None = None,
    client: httpx.Client | None = None,
) -> pd.DataFrame:
    """중기예보. TODO: 항목 필드·예보 기간은 응답 스키마 확정 후 정리."""
    cfg = cfg or KmaHttpConfig()
    key = _load_kma_key(cfg.api_key)
    params: dict[str, Any] = {
        "serviceKey": key,
        "pageNo": 1,
        "numOfRows": p.num_of_rows,
        "dataType": p.data_type,
        "stnId": p.stn_id,
        "tmFc": p.tm_fc,
    }
    own = client is None
    c = client or httpx.Client(timeout=cfg.timeout_sec)
    try:
        r = c.get(MID_FCST_URL, params=params)
        r.raise_for_status()
        payload = r.json()
    finally:
        if own:
            c.close()

    code, msg = _kma_result_code_message(payload)
    if code != "00":
        raise RuntimeError(f"기상청 API 오류 resultCode={code} resultMsg={msg}")

    rows = _parse_kma_json_items(payload)
    return pd.DataFrame(rows) if rows else pd.DataFrame()


@dataclass
class NwpLdapsParams:
    """수치모델(경량화) 격자."""

    base_time: str  # YYYYMMDDHHmm
    dong_code: str
    data_type_cd: str  # 예: Temp
    num_of_rows: int = 10
    data_type: DataType = "JSON"


def fetch_nwp_ldaps_unis_area(
    p: NwpLdapsParams,
    *,
    cfg: KmaHttpConfig | None = None,
    client: httpx.Client | None = None,
) -> pd.DataFrame:
    """LDAPS UNIS 구역. TODO: dataTypeCd·동코드 매핑 확정."""
    cfg = cfg or KmaHttpConfig()
    key = _load_kma_key(cfg.api_key)
    params: dict[str, Any] = {
        "serviceKey": key,
        "pageNo": 1,
        "numOfRows": p.num_of_rows,
        "dataType": p.data_type,
        "baseTime": p.base_time,
        "dongCode": p.dong_code,
        "dataTypeCd": p.data_type_cd,
    }
    own = client is None
    c = client or httpx.Client(timeout=cfg.timeout_sec)
    try:
        r = c.get(NWP_LDAPS_UNIS_AREA_URL, params=params)
        r.raise_for_status()
        payload = r.json()
    finally:
        if own:
            c.close()

    code, msg = _kma_result_code_message(payload)
    if code != "00":
        raise RuntimeError(f"기상청 API 오류 resultCode={code} resultMsg={msg}")

    rows = _parse_kma_json_items(payload)
    return pd.DataFrame(rows) if rows else pd.DataFrame()


@dataclass
class WthrWrnParams:
    """기상특보 목록."""

    stn_id: str
    from_tm_fc: str  # YYYYMMDD
    to_tm_fc: str
    num_of_rows: int = 10
    data_type: DataType = "JSON"


def fetch_wthr_wrn_list(
    p: WthrWrnParams,
    *,
    cfg: KmaHttpConfig | None = None,
    client: httpx.Client | None = None,
) -> pd.DataFrame:
    """기상특보 목록. TODO: 특보 종류·해제 시각 등 알림 로직과 연결."""
    cfg = cfg or KmaHttpConfig()
    key = _load_kma_key(cfg.api_key)
    params: dict[str, Any] = {
        "serviceKey": key,
        "pageNo": 1,
        "numOfRows": p.num_of_rows,
        "dataType": p.data_type,
        "stnId": p.stn_id,
        "fromTmFc": p.from_tm_fc,
        "toTmFc": p.to_tm_fc,
    }
    own = client is None
    c = client or httpx.Client(timeout=cfg.timeout_sec)
    try:
        r = c.get(WTHR_WRN_LIST_URL, params=params)
        r.raise_for_status()
        payload = r.json()
    finally:
        if own:
            c.close()

    code, msg = _kma_result_code_message(payload)
    if code != "00":
        raise RuntimeError(f"기상청 API 오류 resultCode={code} resultMsg={msg}")

    rows = _parse_kma_json_items(payload)
    return pd.DataFrame(rows) if rows else pd.DataFrame()


# ---------------------------------------------------------------------------
# weather_loader.py 호환용 스텁 (기존 이름 유지) — 세부 파싱은 TODO
# ---------------------------------------------------------------------------

def fetch_kma_midterm_forecast(
    api_key: str,
    *,
    client: httpx.Client | None = None,
) -> pd.DataFrame:
    """
    기상청 중기예보(D+4~11).

    TODO: MidFcstParams(발표시각·구역)를 호출부에서 주입하도록 바꾸고,
    getMidFcst 응답을 대시보드용 테이블로 정규화.
    """
    _ = (api_key, client)
    raise NotImplementedError(
        "TODO: MidFcstParams + fetch_mid_fcst 로 대체. "
        "발표 시각(tmFc)·stnId 정책 확정 후 구현."
    )


def fetch_kma_weather_alerts(
    api_key: str,
    *,
    client: httpx.Client | None = None,
) -> pd.DataFrame:
    """
    기상청 기상특보(한파·폭염 등).

    TODO: fetch_wthr_wrn_list + 지역·SKU 매핑.
    """
    _ = (api_key, client)
    raise NotImplementedError(
        "TODO: WthrWrnParams + fetch_wthr_wrn_list 로 대체. "
        "stnId·기간(from/to) 정책 확정 후 구현."
    )
