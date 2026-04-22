"""
기상청 중기예보 조회 서비스 로더.

공공데이터포털: MidFcstInfoService
  - getMidTa         : 중기기온 (+4 ~ +10일) 최저/최고
  - getMidLandFcst   : 중기육상예보 (+4 ~ +10일) 날씨/강수확률

용도:
  Open-Meteo ECMWF(0~15일, 글로벌 모델) 대비 한반도 특화 정확도를 얻기 위해
  +4 ~ +10일 구간을 KMA 중기예보로 보강한다.

발표 시각(tmFc): 매일 06시, 18시. 최근 발표 것을 자동 선택.
"""
from __future__ import annotations

import os
import time
from datetime import datetime, timedelta
from typing import Any, Iterable

import pandas as pd
import requests

BASE_URL = "https://apis.data.go.kr/1360000/MidFcstInfoService"

# (ASOS 관측소 ID, 지역명, 중기기온 regId, 중기육상 regId)
# 주의: 중기기온(21F*)과 중기육상(11F*·11H*)의 regId 체계가 다름
STATION_MAP: dict[int, tuple[str, str, str]] = {
    108: ("서울", "11B10101", "11B00000"),
    119: ("수원", "11B20501", "11B00000"),
    133: ("대전", "11C20101", "11C20000"),
    156: ("광주", "21F20801", "11F20000"),   # 광주·전남 육상은 11F20000
    159: ("부산", "21F10501", "11H20000"),   # 부산·울산·경남 육상은 11H20000
}


def _latest_tm_fc(now: datetime | None = None) -> str:
    """가장 최근 발표 시각(YYYYMMDDHHMM) 반환. 06시 또는 18시."""
    now = now or datetime.now()
    if now.hour >= 18:
        return now.strftime("%Y%m%d") + "1800"
    if now.hour >= 6:
        return now.strftime("%Y%m%d") + "0600"
    return (now - timedelta(days=1)).strftime("%Y%m%d") + "1800"


def _request_json(endpoint: str, params: dict[str, Any], retry: int = 2) -> dict | None:
    url = f"{BASE_URL}/{endpoint}"
    for attempt in range(retry + 1):
        try:
            r = requests.get(url, params=params, timeout=20)
            if r.status_code != 200:
                time.sleep(0.5)
                continue
            return r.json()
        except Exception:
            time.sleep(0.5)
    return None


def fetch_kma_mid_ta(
    reg_id: str,
    *,
    service_key: str | None = None,
    tm_fc: str | None = None,
) -> dict | None:
    """중기기온 단건 조회. 성공 시 item dict(+4~+10일 최저/최고), 실패 시 None."""
    key = service_key or os.getenv("KMA_API_KEY")
    params = {
        "serviceKey": key,
        "pageNo": 1, "numOfRows": 10,
        "dataType": "JSON",
        "regId": reg_id,
        "tmFc": tm_fc or _latest_tm_fc(),
    }
    data = _request_json("getMidTa", params)
    try:
        return data["response"]["body"]["items"]["item"][0]
    except Exception:
        return None


def fetch_kma_mid_land(
    reg_id: str,
    *,
    service_key: str | None = None,
    tm_fc: str | None = None,
) -> dict | None:
    """중기육상예보 단건 조회. 성공 시 item dict(날씨/강수확률), 실패 시 None."""
    key = service_key or os.getenv("KMA_API_KEY")
    params = {
        "serviceKey": key,
        "pageNo": 1, "numOfRows": 10,
        "dataType": "JSON",
        "regId": reg_id,
        "tmFc": tm_fc or _latest_tm_fc(),
    }
    data = _request_json("getMidLandFcst", params)
    try:
        return data["response"]["body"]["items"]["item"][0]
    except Exception:
        return None


def fetch_kma_mid_forecast(
    stations: Iterable[int] | None = None,
    *,
    tm_fc: str | None = None,
) -> pd.DataFrame:
    """
    5개 관측소 × +4~+10일 중기예보를 하나의 DataFrame으로 반환.

    컬럼:
        date (예측 대상일), station_id, region,
        temp_min, temp_max, precipitation_prob_am, precipitation_prob_pm,
        weather_am, weather_pm, source, tm_fc

    tm_fc 기준일의 다음 날짜부터 +4~+10일. 4~7일은 Am/Pm 분리, 8~10일은 단일.
    """
    stations = list(stations) if stations else list(STATION_MAP.keys())
    tm_fc = tm_fc or _latest_tm_fc()
    base_date = datetime.strptime(tm_fc[:8], "%Y%m%d").date()

    rows: list[dict[str, Any]] = []
    for stn in stations:
        if stn not in STATION_MAP:
            continue
        name, reg_ta, reg_land = STATION_MAP[stn]
        ta_item = fetch_kma_mid_ta(reg_ta, tm_fc=tm_fc) or {}
        land_item = fetch_kma_mid_land(reg_land, tm_fc=tm_fc) or {}

        for d in range(4, 11):
            target = base_date + timedelta(days=d)
            row: dict[str, Any] = {
                "date": target.isoformat(),
                "station_id": stn,
                "region": name,
                "temp_min": ta_item.get(f"taMin{d}"),
                "temp_max": ta_item.get(f"taMax{d}"),
                "source": "kma_mid_fcst",
                "tm_fc": tm_fc,
            }
            # 4~7일: 오전/오후 분리, 8~10일: 단일 필드
            if d <= 7:
                row["precipitation_prob_am"] = land_item.get(f"rnSt{d}Am")
                row["precipitation_prob_pm"] = land_item.get(f"rnSt{d}Pm")
                row["weather_am"] = land_item.get(f"wf{d}Am")
                row["weather_pm"] = land_item.get(f"wf{d}Pm")
            else:
                row["precipitation_prob_am"] = land_item.get(f"rnSt{d}")
                row["precipitation_prob_pm"] = land_item.get(f"rnSt{d}")
                row["weather_am"] = land_item.get(f"wf{d}")
                row["weather_pm"] = land_item.get(f"wf{d}")
            rows.append(row)

    df = pd.DataFrame(rows)
    if not df.empty:
        df["date"] = pd.to_datetime(df["date"])
        for col in ("temp_min", "temp_max", "precipitation_prob_am", "precipitation_prob_pm"):
            df[col] = pd.to_numeric(df[col], errors="coerce")
    return df


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    from dotenv import load_dotenv

    load_dotenv()
    df = fetch_kma_mid_forecast()
    print(f"중기예보 로드: {len(df)}행 (5 지역 × 7일 = {5*7})")
    print(df.to_string(index=False))
