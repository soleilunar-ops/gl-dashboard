"""
Open-Meteo ECMWF HTTP 예시 (키 불필요). 수요예측용으로는 open_meteo_ecmwf + 캐시 권장.

실행:
  python scripts/open_meteo_ecmwf_http_example.py

변경 이유: requests 만으로 동작하는 최소 예시를 레포에 보존
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import requests

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))


def main() -> None:
    url = "https://api.open-meteo.com/v1/ecmwf"
    params = {
        "latitude": 37.5665,
        "longitude": 126.9780,
        "daily": ["temperature_2m_max", "temperature_2m_min", "precipitation_sum", "windspeed_10m_max"],
        "timezone": "Asia/Seoul",
        "forecast_days": 16,
    }
    r = requests.get(url, params=params, timeout=60)
    r.raise_for_status()
    data = r.json()
    print("keys:", list(data.keys()))
    if "daily" in data:
        print("daily keys:", list(data["daily"].keys()))
    # TODO: 프로덕션은 data_pipeline.open_meteo_ecmwf.fetch_ecmwf_daily_forecast 사용
    print(json.dumps({k: data[k] for k in ("daily",) if k in data}, indent=2, ensure_ascii=False)[:2000])


if __name__ == "__main__":
    main()
