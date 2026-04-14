"""
기상청 ASOS 일자료 수집 모듈.
"""

from __future__ import annotations

import os
from datetime import datetime
from typing import Any

import pandas as pd
import requests

ASOS_DAILY_URL = "https://apis.data.go.kr/1360000/AsosDalyInfoService/getWthrDataList"

# 고정 관측소(요구사항)
STATIONS: dict[str, int] = {
    "seoul": 108,
    "suwon": 119,
    "busan": 159,
    "daejeon": 133,
    "gwangju": 156,
}


def load_env() -> str:
    """
    .env/환경변수에서 KMA_API_KEY를 읽는다.
    """
    try:
        from dotenv import load_dotenv

        load_dotenv()
    except ImportError:
        # python-dotenv 미설치 환경에서도 OS 환경변수는 사용 가능
        pass

    api_key = (os.getenv("KMA_API_KEY") or "").strip()
    if not api_key:
        raise ValueError("KMA_API_KEY가 비어 있습니다. .env 또는 환경변수에 설정하세요.")
    return api_key


def _parse_items(payload: dict[str, Any]) -> tuple[list[dict[str, Any]], int]:
    """
    JSON payload에서 item 리스트와 totalCount를 안전하게 추출한다.
    """
    try:
        response = payload["response"]
        header = response["header"]
        body = response["body"]
    except (KeyError, TypeError) as exc:
        raise ValueError("기상청 응답 구조가 예상과 다릅니다.") from exc

    result_code = str(header.get("resultCode", ""))
    result_msg = str(header.get("resultMsg", ""))
    if result_code != "00":
        raise RuntimeError(f"기상청 API 오류 resultCode={result_code}, resultMsg={result_msg}")

    total_count = int(body.get("totalCount", 0) or 0)
    items_wrap = body.get("items")
    if not items_wrap:
        return [], total_count

    item = items_wrap.get("item")
    if item is None:
        return [], total_count
    if isinstance(item, list):
        return item, total_count
    if isinstance(item, dict):
        return [item], total_count
    return [], total_count


def fetch_asos_station_daily(
    api_key: str,
    station_id: int,
    start_date: str,
    end_date: str,
    *,
    timeout_sec: int = 30,
) -> pd.DataFrame:
    """
    단일 관측소 ASOS 일자료를 페이지 단위로 모두 수집한다.
    """
    start_dt = start_date.replace("-", "")
    end_dt = end_date.replace("-", "")

    rows: list[dict[str, Any]] = []
    page_no = 1
    num_of_rows = 999
    total_count = None

    while True:
        params = {
            "serviceKey": api_key,
            "pageNo": page_no,
            "numOfRows": num_of_rows,
            "dataType": "JSON",
            "dataCd": "ASOS",
            "dateCd": "DAY",
            "startDt": start_dt,
            "endDt": end_dt,
            "stnIds": station_id,
        }

        try:
            res = requests.get(ASOS_DAILY_URL, params=params, timeout=timeout_sec)
            res.raise_for_status()
        except requests.RequestException as exc:
            raise RuntimeError(f"관측소 {station_id} API 호출 실패: {exc}") from exc

        try:
            payload = res.json()
        except ValueError as exc:
            raise ValueError(f"관측소 {station_id} JSON 파싱 실패") from exc

        page_rows, page_total = _parse_items(payload)
        if total_count is None:
            total_count = page_total
        rows.extend(page_rows)

        if not page_rows:
            break
        if total_count is not None and len(rows) >= total_count:
            break
        page_no += 1

    if not rows:
        raise ValueError(f"관측소 {station_id} 빈 데이터: {start_date}~{end_date}")

    return pd.DataFrame(rows)


def normalize_asos_columns(df: pd.DataFrame) -> pd.DataFrame:
    """
    ASOS 원본 컬럼을 수요예측 공통 컬럼으로 정규화한다.
    """
    rename_map = {
        "tm": "date",
        "stnId": "station_id",
        "avgTa": "temp_mean",
        "minTa": "temp_min",
        "maxTa": "temp_max",
        "sumRn": "rain_mm",
        "avgWs": "wind_mean",
        "ddMes": "snow_cm",
    }
    out = df.rename(columns=rename_map).copy()

    required = [
        "date",
        "station_id",
        "region",
        "temp_mean",
        "temp_min",
        "temp_max",
        "rain_mm",
        "wind_mean",
    ]
    for col in required:
        if col not in out.columns:
            out[col] = pd.NA
    if "snow_cm" not in out.columns:
        out["snow_cm"] = pd.NA

    # 동일 이름 컬럼이 중복되면 첫 번째 컬럼만 사용해 1차원 Series로 강제한다.
    out = out.loc[:, ~out.columns.duplicated(keep="first")].copy()

    out["date"] = pd.to_datetime(out["date"], errors="coerce")
    out["station_id"] = pd.to_numeric(out["station_id"], errors="coerce")

    numeric_cols = ["temp_mean", "temp_min", "temp_max", "rain_mm", "wind_mean", "snow_cm"]
    for col in numeric_cols:
        out[col] = pd.to_numeric(out[col], errors="coerce")

    out = out[
        [
            "date",
            "station_id",
            "region",
            "temp_mean",
            "temp_min",
            "temp_max",
            "rain_mm",
            "wind_mean",
            "snow_cm",
        ]
    ].sort_values(["date", "station_id"])

    return out.reset_index(drop=True)


def fetch_asos_multi_station_daily(
    start_date: str,
    end_date: str,
    stations: dict[str, int] | None = None,
) -> pd.DataFrame:
    """
    다중 관측소 데이터를 수집해 하나의 DataFrame으로 합친다.
    """
    api_key = load_env()
    target_stations = stations or STATIONS

    collected: list[pd.DataFrame] = []
    errors: list[str] = []

    for region, station_id in target_stations.items():
        try:
            station_df = fetch_asos_station_daily(api_key, station_id, start_date, end_date)
            station_df["region"] = region
            collected.append(station_df)
        except (RuntimeError, ValueError) as exc:
            errors.append(f"{region}({station_id}): {exc}")

    if not collected:
        joined = " | ".join(errors) if errors else "알 수 없는 이유"
        raise RuntimeError(f"모든 관측소 수집 실패: {joined}")

    merged = pd.concat(collected, ignore_index=True)
    normalized = normalize_asos_columns(merged)

    if errors:
        print("[WARN] 일부 관측소 수집 실패:", " | ".join(errors))
    return normalized


def save_as_csv(df: pd.DataFrame, output_path: str = "asos_daily_weather.csv") -> None:
    """
    DataFrame을 CSV로 저장한다.
    """
    df.to_csv(output_path, index=False, encoding="utf-8-sig")
    print(f"저장 완료: {output_path} (rows={len(df)})")


if __name__ == "__main__":
    # 실무 예시: 2023-01-01부터 오늘까지 5개 관측소 수집
    start = "2023-01-01"
    end = datetime.today().strftime("%Y-%m-%d")
    asos_df = fetch_asos_multi_station_daily(start, end, stations=STATIONS)
    save_as_csv(asos_df, output_path="asos_daily_weather.csv")
