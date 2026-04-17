"""
ECMWF Open Data 0~15일 다운로드 + GRIB 후처리 CSV 저장 (선택 의존성 필요).

  pip install ecmwf-opendata xarray cfgrib
  # Windows: cfgrib 는 eccodes 필요 — 실패 시 Open-Meteo 경로(open_meteo_ecmwf) 사용

변경 이유: ecmwf_forecast_data 모듈을 CLI 로 실행하기 위함
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from data_pipeline.ecmwf_forecast_data import run_open_data_0_15_pipeline


def main() -> None:
    p = argparse.ArgumentParser(description="ECMWF Open Data 0~15일 파이프라인")
    p.add_argument("--run-date", type=str, default=None, help="YYYYMMDD (기본: 오늘 UTC)")
    p.add_argument("--run-time", type=int, default=0, help="UTC 0 또는 12")
    p.add_argument("--grib-dir", type=Path, default=Path("./data/ecmwf_open_0_15"))
    p.add_argument("--csv-dir", type=Path, default=Path("./output/ecmwf_open_0_15"))
    p.add_argument("--ensemble", action="store_true", help="ENS control 예보 사용")
    args = p.parse_args()

    r = run_open_data_0_15_pipeline(
        run_date=args.run_date,
        run_time=args.run_time,
        out_dir=args.grib_dir,
        export_csv_dir=args.csv_dir,
        use_ensemble=args.ensemble,
    )
    print("GRIB:", r.grib_path)
    print("CSV:", r.long_csv, r.wide_csv, r.daily_csv, sep="\n  ")


if __name__ == "__main__":
    main()
