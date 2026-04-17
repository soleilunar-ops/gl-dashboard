"""
기상청(공공데이터포털) API 호출 예시 — 문서에 나온 requests 방식 보관용.

- URL·파라미터는 공공데이터포털 예제와 동일한 구성이다.
- 응답은 기본 XML(dataType=XML). JSON 이 필요하면 dataType 을 JSON 으로 바꾼다.
- 실제 학습·피처 파이프라인에서는 `data_pipeline.kma_api` 사용을 권장한다.

실행 전: 프로젝트 루트에 `.env` 를 두고 `KMA_API_KEY=` 디코딩 키를 넣는다.

변경 이유: 사용자 제공 예시 코드를 레포에 보존하고 환경변수로만 키를 주입하기 위함
"""

from __future__ import annotations

import argparse
import os
import sys
from collections.abc import Callable
from pathlib import Path

import requests

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

try:
    from dotenv import load_dotenv

    load_dotenv(_ROOT / ".env")
except ImportError:
    pass

# 공공데이터포털 예시는 http 로도 안내하나, 여기서는 https 로 통일한다.
_BASE = "https://apis.data.go.kr/1360000"


def _service_key() -> str:
    k = (os.getenv("KMA_API_KEY") or "").strip()
    if not k:
        raise SystemExit(
            "KMA_API_KEY 가 설정되지 않았습니다. .env 또는 환경 변수에 기상청 디코딩 키를 넣으세요."
        )
    return k


def sample_asos_hourly() -> requests.Response:
    """기상청_지상(종관, ASOS) 시간자료 조회서비스."""
    url = f"{_BASE}/AsosHourlyInfoService/getWthrDataList"
    params = {
        "serviceKey": _service_key(),
        "pageNo": "1",
        "numOfRows": "10",
        "dataType": "XML",
        "dataCd": "ASOS",
        "dateCd": "HR",
        "startDt": "20100101",
        "startHh": "01",
        "endDt": "20100601",
        "endHh": "01",
        "stnIds": "108",
    }
    return requests.get(url, params=params, timeout=60)


def sample_vilage_ultra_short_ncst() -> requests.Response:
    """기상청_단기예보 조회서비스 — 초단기실황."""
    url = f"{_BASE}/VilageFcstInfoService_2.0/getUltraSrtNcst"
    params = {
        "serviceKey": _service_key(),
        "pageNo": "1",
        "numOfRows": "1000",
        "dataType": "XML",
        "base_date": "20210628",
        "base_time": "0600",
        "nx": "55",
        "ny": "127",
    }
    return requests.get(url, params=params, timeout=60)


def sample_mid_fcst() -> requests.Response:
    """기상청_중기예보 조회서비스."""
    url = f"{_BASE}/MidFcstInfoService/getMidFcst"
    params = {
        "serviceKey": _service_key(),
        "pageNo": "1",
        "numOfRows": "10",
        "dataType": "XML",
        "stnId": "108",
        "tmFc": "201310170600",
    }
    return requests.get(url, params=params, timeout=60)


def sample_asos_daily() -> requests.Response:
    """기상청_지상(종관, ASOS) 일자료 조회서비스."""
    url = f"{_BASE}/AsosDalyInfoService/getWthrDataList"
    params = {
        "serviceKey": _service_key(),
        "pageNo": "1",
        "numOfRows": "10",
        "dataType": "XML",
        "dataCd": "ASOS",
        "dateCd": "DAY",
        "startDt": "20100101",
        "endDt": "20100601",
        "stnIds": "108",
    }
    return requests.get(url, params=params, timeout=60)


def sample_nwp_ldaps_unis_area() -> requests.Response:
    """기상청_수치모델자료(경량화) 조회서비스."""
    url = f"{_BASE}/NwpModelInfoService/getLdapsUnisArea"
    params = {
        "serviceKey": _service_key(),
        "pageNo": "1",
        "numOfRows": "10",
        "dataType": "XML",
        "baseTime": "201911120300",
        "dongCode": "1100000000",
        "dataTypeCd": "Temp",
    }
    return requests.get(url, params=params, timeout=60)


def sample_wthr_wrn_list() -> requests.Response:
    """기상청_기상특보 조회서비스."""
    url = f"{_BASE}/WthrWrnInfoService/getWthrWrnList"
    params = {
        "serviceKey": _service_key(),
        "pageNo": "1",
        "numOfRows": "10",
        "dataType": "XML",
        "stnId": "184",
        "fromTmFc": "20170601",
        "toTmFc": "20170607",
    }
    return requests.get(url, params=params, timeout=60)


_SAMPLES: dict[str, Callable[[], requests.Response]] = {
    "asos_hourly": sample_asos_hourly,
    "vilage_ncst": sample_vilage_ultra_short_ncst,
    "mid_fcst": sample_mid_fcst,
    "asos_daily": sample_asos_daily,
    "nwp_ldaps": sample_nwp_ldaps_unis_area,
    "wthr_wrn": sample_wthr_wrn_list,
}


def main() -> None:
    p = argparse.ArgumentParser(description="기상청 API 예시 호출 (requests + XML 응답)")
    p.add_argument(
        "name",
        nargs="?",
        choices=sorted(_SAMPLES.keys()),
        help="호출할 예시 이름 (생략 시 목록만 출력)",
    )
    args = p.parse_args()
    if not args.name:
        print("사용 가능한 예시:", ", ".join(sorted(_SAMPLES.keys())))
        print("실행 예: python scripts/kma_api_reference_samples.py asos_daily")
        return
    r = _SAMPLES[args.name]()
    print("status:", r.status_code)
    print(r.content.decode("utf-8", errors="replace"))


if __name__ == "__main__":
    main()
