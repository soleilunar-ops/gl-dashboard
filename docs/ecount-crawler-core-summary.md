# Ecount 크롤링 핵심 기능 요약

## 1) 전체 목적

- Ecount ERP에서 메뉴별 데이터를 수집해 Supabase에 적재합니다.
- 주요 대상 메뉴는 `생산입고조회`, `구매현황`, `판매현황`입니다.
- 멀티 파이프라인에서 한 번의 실행으로 메뉴를 순차 처리합니다.

## 2) 실행 진입점

- 파이프라인 실행: `scripts/ecount_multi_pipeline.py`
  - 기본 순서: 생산입고조회 -> 구매현황 -> 판매현황
  - 단계별 크롤러:
    - `ecount_steps/production_receipt_crawler.py`
    - `ecount_steps/purchase_crawler.py`
    - `ecount_steps/sales_crawler.py`
- 공통 런타임/자동화 엔진: `scripts/ecount_runtime.py`

## 3) 크롤링 핵심 흐름

1. 환경변수(`.env.local`) 로드 및 기업별 자격증명 해석
2. 실행 시작 시 쿠키 파일 삭제 후 신규 로그인 강제
3. 로그인 페이지 자동 입력/클릭
   - 로그인 폼 탐지(페이지/iframe 모두 시도)
   - 로그인 오버레이 닫기
   - 접속현황 팝업의 `확인` 자동 클릭
4. `ec_req_sid` 확보 후 메뉴 URL 구성 및 진입
5. 메뉴 타입별 처리
   - `excel_only`: 바로 엑셀 다운로드
   - `search_excel`: 검색(F8) 후 엑셀 다운로드
   - `filter_excel`: 날짜 필터 후 엑셀 다운로드
   - `filter_table`: 날짜 필터 후 DOM 테이블 추출
6. 메뉴별 정규화 함수로 데이터 정제 후 DB 저장(옵션)

## 4) 메뉴별 데이터 처리 방식

- 생산입고조회(`production_receipt`)
  - 방식: 엑셀 다운로드 + pandas 정규화
  - 정규화: `ecount_steps/production_receipt_core.py`
  - 저장 테이블: `ecount_production_receipt`
- 구매현황(`purchase`)
  - 방식: 검색(F8) 후 엑셀 다운로드 + pandas 정규화
  - 정규화: `ecount_steps/purchase_core.py`
  - 저장 테이블: `ecount_purchase_excel`
- 판매현황(`sales`)
  - 방식: 검색(F8) 후 엑셀 다운로드 + pandas 정규화
  - 정규화: `ecount_steps/sales_core.py`
  - 저장 테이블: `ecount_sales_excel`

## 5) 안정화 포인트

- 로그인 재시도(기본 2회)
- 탭/페이지가 닫힌 경우 살아있는 페이지 재선택
- `ec_req_sid` 미노출 시 ERP 메인 URL 경유 재확보
- 메뉴별 실패 시 `retry_per_menu`만큼 재시도 후 다음 메뉴 진행
- 엑셀 버튼은 다중 셀렉터 + JS 폴백으로 탐색

## 6) Supabase 저장 정책

- 기본은 기간 단위 `delete -> insert` 교체 저장 패턴
- 메뉴별 전용 replace 함수 사용(생산입고/구매/판매)
- `--no-db` 옵션으로 크롤링만 점검 가능

## 7) 주요 실행 명령어

- 멀티 파이프라인(기본):
  - `python scripts/ecount_multi_pipeline.py --company gl --from 2025-03-01 --to 2026-04-19`
- DB 저장 없이 점검:
  - `python scripts/ecount_multi_pipeline.py --company gl --from 2025-03-01 --to 2026-04-19 --no-db`
- 메뉴 단건 실행:
  - `python scripts/ecount_crawler.py --company gl --menu production_receipt --from 2025-03-01 --to 2026-04-19 --no-db`

## 8) 필수 환경변수(요약)

- 공통 인증:
  - `ECOUNT_{회사코드}_COM_CODE`
  - `ECOUNT_{회사코드}_USER_ID`
  - `ECOUNT_{회사코드}_USER_PW`
- 메뉴 URL 파라미터(필요 시):
  - `ECOUNT_{회사코드}_{메뉴블록}_PRG_ID`
  - `ECOUNT_{회사코드}_{메뉴블록}_MENU_TYPE`
  - `ECOUNT_{회사코드}_{메뉴블록}_MENU_SEQ`
  - `ECOUNT_{회사코드}_{메뉴블록}_GROUP_SEQ`
  - `ECOUNT_{회사코드}_{메뉴블록}_DEPTH`
- Supabase:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`

## 9) 빠른 트러블슈팅

- 로그인 실패 반복:
  - 오버레이/팝업이 남아있는지 확인
  - `.env.local` 자격증명 재확인
  - 보안문자/2차인증 여부 확인
- 엑셀 다운로드 실패:
  - 버튼 셀렉터 확인 (`ECOUNT_EXCEL_EXTRA_SELECTORS` 활용)
  - 메뉴 `prgId`/해시 파라미터 확인
- DB 저장 실패:
  - 해당 테이블 마이그레이션 적용 여부 확인
  - 서비스 롤 키/권한 확인
