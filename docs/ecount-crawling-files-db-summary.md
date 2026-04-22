# Ecount 크롤링 코드/DB 요약

변경 이유: 크롤링 기능에서 실제 사용 중인 파일과 DB 테이블을 빠르게 파악할 수 있도록 정리합니다.

## 1) 현재 기준 핵심 코드 파일

### 엔트리/오케스트레이션

- `scripts/ecount_multi_pipeline.py`
  - 멀티 메뉴 실행 진입점
  - 실행 순서: 생산입고조회 -> 구매현황 -> 판매현황
- `scripts/ecount_crawler.py`
  - 얇은 진입 파사드
  - 내부적으로 `ecount_runtime_core` 실행
- `scripts/ecount_runtime_core.py`
  - 크롤링 전체 오케스트레이션
  - `EcountCrawler` 클래스(단일 메뉴/멀티 메뉴 실행, DB 저장 분기)

### 런타임 분리 모듈

- `scripts/ecount_runtime_browser.py`
  - Playwright 브라우저 자동화 로직
  - 로그인, 메뉴 진입, 검색(F8), 엑셀 다운로드, 테이블 추출
- `scripts/ecount_runtime_company.py`
  - 기업 코드/환경변수/메뉴 상수/쿠키 경로/자격증명 로딩

### 메뉴별 단계 모듈

- `scripts/ecount_steps/production_receipt_crawler.py`
- `scripts/ecount_steps/purchase_crawler.py`
- `scripts/ecount_steps/sales_crawler.py`
  - 각 메뉴를 어떤 page_type으로 실행할지 정의
  - 현재 구매/판매는 `search_excel` 기준

### 엑셀 정규화/저장 모듈

- `scripts/ecount_steps/production_receipt_core.py`
  - 생산입고조회 엑셀 정규화 + replace 저장
- `scripts/ecount_steps/purchase_core.py`
  - 구매현황 엑셀 정규화 + `ecount_purchase_excel` replace 저장
- `scripts/ecount_steps/sales_core.py`
  - 판매현황 엑셀 정규화 + `ecount_sales_excel` replace 저장

## 2) 메뉴별 수집/저장 경로

### 생산입고조회 (`production_receipt`)

- 수집 방식: 메뉴 진입 후 엑셀 다운로드
- 정규화: `production_receipt_core.normalize_production_receipt_xlsx`
- 저장 테이블: `ecount_production_receipt`

### 구매현황 (`purchase`)

- 수집 방식: 검색(F8) -> 엑셀 다운로드 (`search_excel`)
- 정규화: `purchase_core.normalize_purchase_excel_xlsx`
- 저장 테이블: `ecount_purchase_excel`

### 판매현황 (`sales`)

- 수집 방식: 검색(F8) -> 엑셀 다운로드 (`search_excel`)
- 정규화: `sales_core.normalize_sales_excel_xlsx`
- 저장 테이블: `ecount_sales_excel`

## 3) Supabase DB 관련 파일

### 마이그레이션

- `supabase/migrations/20260420173000_create_ecount_purchase_excel.sql`
  - 구매 엑셀 저장용 테이블 생성
- (판매 엑셀 테이블은 별도 마이그레이션/스키마에서 관리)

### 타입 정의

- `supabase/types.ts`
  - `ecount_purchase`, `ecount_sales`, 기타 테이블 타입 정의
  - 프론트/백엔드에서 스키마 확인용 참조

## 4) 실행 시 자주 쓰는 커맨드

```bash
# 멀티 파이프라인 실행(기본: DB 저장 ON)
python scripts/ecount_multi_pipeline.py --company gl --from 2026-04-01 --to 2026-04-20

# 단일 메뉴 빠른 점검(파이썬 one-liner 예시)
$env:PYTHONPATH='scripts'; python -c "import asyncio; from ecount_runtime_core import EcountCrawler,EcountMenu; c=EcountCrawler(company_code='gl'); print(asyncio.run(c.crawl_multi_menus_and_save(menus=[EcountMenu.구매현황], date_from='2026-04-01', date_to='2026-04-20', save_to_db=True, page_types={'purchase':'search_excel'}, retry_per_menu=1)))"
```

## 5) 현재 운영 시 주의 포인트

- `scripts/ecount_runtime.py`는 현재 사용하지 않으며 삭제된 상태
- 실제 런타임 기준 파일은 `ecount_runtime_core.py` + `ecount_runtime_browser.py` + `ecount_runtime_company.py`
- `발주현황(order)` 메뉴 코드는 현재 제거되어 사용하지 않음
- 엑셀 다운로드 실패 시(버튼/팝업 이슈) `ecount_runtime_browser.py`의 selector/다운로드 대기 구간을 우선 점검

## 6) glpharm 판매/구매 전용 분리 파일

- `scripts/ecount_glpharm_multi_pipeline.py`
  - glpharm 전용 멀티 엔트리
  - 실행 순서: 구매현황 -> 판매현황
- `scripts/ecount_glpharm_runtime_core.py`
  - glpharm 회사 코드 고정 래퍼 (`GlpharmEcountCrawler`)
  - 구매/판매 각각 `search_excel` 고정 호출
- `scripts/ecount_steps/glpharm_purchase_crawler.py`
  - glpharm 구매현황 단계 모듈
- `scripts/ecount_steps/glpharm_sales_crawler.py`
  - glpharm 판매현황 단계 모듈

```bash
# glpharm 판매/구매 전용 파이프라인 실행
python scripts/ecount_glpharm_multi_pipeline.py --from 2026-04-01 --to 2026-04-20
```
