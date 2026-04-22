"""
Ecount 크롤러 파사드 모듈.
변경 이유: 대형 구현 파일을 분리해 ecount_crawler.py를 얇은 진입점으로 유지합니다.
"""

from __future__ import annotations

from ecount_runtime_core import *  # noqa: F401,F403


if __name__ == "__main__":
    import runpy

    runpy.run_module("ecount_runtime_core", run_name="__main__")
