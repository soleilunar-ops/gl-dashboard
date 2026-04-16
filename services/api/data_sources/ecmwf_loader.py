"""
ECMWF Open Data 0~15일 예보 다운로드 모듈.

주의: 이 데이터는 GRIB2 형식으로 저장된다.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    from ecmwf.opendata import Client
except ImportError:
    Client = None


def _require_ecmwf_opendata() -> None:
    """
    ecmwf-opendata 설치 여부를 확인한다.
    """
    if Client is None:
        raise ImportError(
            "ecmwf-opendata가 현재 환경에 설치되어 있지 않습니다. "
            "활성 가상환경에서 `pip install ecmwf-opendata`를 실행하세요."
        )


def validate_run_time(run_time: int) -> int:
    """
    run_time 입력값을 검증한다.
    """
    if run_time not in {0, 12}:
        raise ValueError(f"run_time은 0 또는 12만 허용됩니다. 입력값: {run_time}")
    return run_time


def build_target_path(run_date: str, run_time: int, out_dir: str) -> Path:
    """
    저장 대상 GRIB2 파일 경로를 생성한다.
    """
    out_path = Path(out_dir)
    out_path.mkdir(parents=True, exist_ok=True)
    filename = f"ecmwf_open_hres_{run_date}_{run_time:02d}z_0_360h.grib2"
    return out_path / filename


def fetch_ecmwf_open_data_0_15_days(
    run_date: str,
    run_time: int = 0,
    out_dir: str = "./data/ecmwf_open_0_15",
) -> str:
    """
    ECMWF Open Data에서 0~15일(0~360h) 예보를 GRIB2로 저장한다.
    """
    _require_ecmwf_opendata()
    validated_time = validate_run_time(run_time)
    target_path = build_target_path(run_date, validated_time, out_dir)

    client = Client(source="ecmwf")
    params = ["2t", "tp", "10u", "10v", "msl"]

    try:
        client.retrieve(
            date=run_date,
            time=validated_time,
            stream="oper",
            type="fc",
            step="0/to/360/by/6",
            param=params,
            target=str(target_path),
        )
    except Exception as exc:
        raise RuntimeError(
            "ECMWF Open Data 다운로드 실패: "
            f"run_date={run_date}, run_time={validated_time}, "
            f"target={target_path}, error={exc}"
        ) from exc

    return str(target_path)


def fetch_latest_available_open_data_0_15_days(
    *,
    lookback_days: int = 5,
    out_dir: str = "./data/ecmwf_open_0_15",
) -> str:
    """
    최신 run이 아직 게시되지 않은 경우를 대비해 최근 가용 run을 자동 탐색한다.
    """
    if lookback_days < 0:
        raise ValueError(f"lookback_days는 0 이상이어야 합니다. 입력값: {lookback_days}")

    now_utc = datetime.now(timezone.utc)
    errors: list[str] = []
    for day_offset in range(lookback_days + 1):
        run_date = (now_utc - timedelta(days=day_offset)).strftime("%Y%m%d")
        for run_time in (0, 12):
            try:
                return fetch_ecmwf_open_data_0_15_days(run_date, run_time, out_dir=out_dir)
            except RuntimeError as exc:
                errors.append(f"{run_date} {run_time:02d}z: {exc}")
                continue

    raise RuntimeError(
        "최근 가용 ECMWF Open Data run을 찾지 못했습니다. "
        f"최근 {lookback_days}일을 탐색했지만 모두 실패했습니다.\n"
        + "\n".join(errors[-4:])
    )


if __name__ == "__main__":
    try:
        saved = fetch_latest_available_open_data_0_15_days(out_dir="./data/ecmwf_open_0_15")
        print(f"저장 완료: {saved}")
    except Exception as e:
        print(f"[ERROR] {e}")
        raise
