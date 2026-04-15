"""
ECMWF 16~46일 확장(S2S 등) 연동 준비용 인터페이스.

현재 단계 목표:
  - 실제 다운로드 구현보다 함수 시그니처/입출력 계약을 먼저 고정한다.
  - 추후 `ecmwf-api-client` 기반 구현을 붙일 수 있도록 구조를 분리한다.
  - 0~15일 Open Data 로더와 유사한 스타일(입력 인자, 경로 반환, 예외 메시지)로 맞춘다.

인증 전제:
  - ~/.ecmwfapirc 또는 환경변수로 API 자격증명을 제공한다.
  - 일반적으로 ~/.ecmwfapirc 예시는 아래 형태를 사용한다.
    {
      "url": "https://api.ecmwf.int/v1",
      "key": "...",
      "email": "..."
    }
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import pandas as pd


def check_ecmwf_api_credentials() -> dict[str, str]:
    """
    ECMWF API 자격증명 존재 여부를 점검한다.

    입력:
      없음.

    확인 대상(우선순위):
      1) 환경변수: ECMWF_URL, ECMWF_KEY, ECMWF_EMAIL
      2) 사용자 홈: ~/.ecmwfapirc

    출력:
      dict[str, str]
        - source: "env" | "ecmwfapirc"
        - url: API URL
        - key: API key (호출 시에는 로그에 노출 금지)
        - email: 계정 이메일

    예외:
      RuntimeError:
        자격증명이 없거나 필수 필드가 비어 있는 경우.

    TODO:
      - JSON 파싱/필드 검증 로직 구현
      - 키 마스킹 유틸 추가
    """
    env_url = (os.getenv("ECMWF_URL") or "").strip()
    env_key = (os.getenv("ECMWF_KEY") or "").strip()
    env_email = (os.getenv("ECMWF_EMAIL") or "").strip()
    if env_url and env_key and env_email:
        return {"source": "env", "url": env_url, "key": env_key, "email": env_email}

    rc_path = Path.home() / ".ecmwfapirc"
    if rc_path.exists():
        raise NotImplementedError("TODO: ~/.ecmwfapirc 파싱 및 필수 키(url/key/email) 검증 구현")

    raise RuntimeError(
        "ECMWF 자격증명을 찾지 못했습니다. "
        "환경변수(ECMWF_URL/ECMWF_KEY/ECMWF_EMAIL) 또는 ~/.ecmwfapirc 를 설정하세요."
    )


def fetch_ecmwf_extended_16_46_days(
    run_date: str,
    out_dir: str,
    area: str | None = None,
) -> str | dict[str, str]:
    """
    ECMWF 16~46일(확장 구간) 예보 파일을 다운로드한다.

    입력:
      run_date: str
        - 실행 기준일.
        - 권장 형식: "YYYY-MM-DD" (추후 API 스펙 확정 시 단일 형식으로 고정 예정)
      out_dir: str
        - 다운로드 파일 저장 폴더.
      area: str | None
        - 선택 영역 제한. 예: "45/120/30/135" (N/W/S/E)
        - None이면 전역 또는 서비스 기본 영역.

    출력:
      str | dict[str, str]
        - 최소 1개 GRIB 파일 경로를 반환.
        - 제어예보/앙상블 등을 분리 저장할 경우 {"cf": "...", "pf": "..."} 형태를 반환.

    예외:
      ValueError:
        run_date 형식이 잘못된 경우.
      RuntimeError:
        인증 누락/권한 부족/원격 API 실패 시.

    TODO:
      - ecmwf-api-client(ECMWFDataServer) 기반 요청 조합 확정
      - step/param/grid/stream/type 정책 확정
      - 응답 파일명 규칙(날짜·시간·구간)을 0~15일 로더와 통일
    """
    _ = (run_date, area)
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    check_ecmwf_api_credentials()
    raise NotImplementedError("TODO: ecmwf-api-client를 사용한 16~46일 다운로드 구현")


def parse_grib_to_dataframe(grib_path: str) -> pd.DataFrame:
    """
    GRIB/GRIB2 파일을 DataFrame으로 변환한다.

    입력:
      grib_path: str
        - 로컬 GRIB 파일 경로.
        - 16~46일 확장 다운로드 결과 파일을 대상으로 한다.

    출력:
      pandas.DataFrame
        최소 컬럼 계약(추후 확정):
        - time
        - step
        - valid_time
        - latitude
        - longitude
        - variable
        - value
        (앙상블 사용 시 number 컬럼 포함 가능)

    예외:
      FileNotFoundError:
        파일이 존재하지 않는 경우.
      RuntimeError:
        cfgrib/eccodes 환경 문제 또는 파싱 실패.

    TODO:
      - xarray+cfgrib 파싱 구현
      - 변수 필터(shortName) 기준 분할 읽기 구현
      - 단위 변환(2t K->C, tp m->mm 등) 정책은 feature 계층과 정합 맞춰 반영
    """
    p = Path(grib_path)
    if not p.exists():
        raise FileNotFoundError(f"GRIB 파일이 없습니다: {grib_path}")
    raise NotImplementedError("TODO: GRIB -> DataFrame 파서 구현")

