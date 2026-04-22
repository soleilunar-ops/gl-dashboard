# 이카운트 3사 크롤링 PM 전달 요약

> 지엘(GL) · 지엘팜(glpharm) · HNB — 판매/구매/생산입고 범위, 실행 파일, DB 마이그레이션 경로 정리

---

## 1. 3사별 수집 범위

| 회사   | 코드      | 메뉴                             |
| ------ | --------- | -------------------------------- |
| 지엘   | `gl`      | 판매현황, 구매현황, **생산입고** |
| 지엘팜 | `glpharm` | 판매현황, 구매현황               |
| HNB    | `hnb`     | 판매현황, 구매현황               |

**멀티 파이프라인 실행 순서**

- 지엘: 생산입고 → 구매 → 판매
- 지엘팜 / HNB: 구매 → 판매

---

## 2. 핵심 동작 (한 줄)

이카운트 ERP에서 메뉴별 **엑셀 다운로드** → pandas **정규화** → Supabase에 **기간(`date_from`~`date_to`) 단위 삭제 후 재삽입(replace)**. 브라우저 자동화는 **Playwright**, 기업별 자격증명은 `.env` 접두사 `ECOUNT_GL` / `ECOUNT_GLPHARM` / `ECOUNT_HNB`.

---

## 3. 실행 진입점 (파일 주소)

| 설명                           | 경로                                       |
| ------------------------------ | ------------------------------------------ |
| 지엘 멀티 (생산입고→구매→판매) | `scripts/ecount_multi_pipeline.py`         |
| 지엘팜 멀티 (구매→판매)        | `scripts/ecount_glpharm_multi_pipeline.py` |
| HNB 멀티 (구매→판매)           | `scripts/ecount_hnb_multi_pipeline.py`     |
| 단일/보조 진입                 | `scripts/ecount_crawler.py`                |

### 런타임

| 설명                          | 경로                                     |
| ----------------------------- | ---------------------------------------- |
| 크롤 오케스트레이션           | `scripts/ecount_runtime_core.py`         |
| Playwright (로그인·검색·엑셀) | `scripts/ecount_runtime_browser.py`      |
| 기업·환경변수·쿠키 경로       | `scripts/ecount_runtime_company.py`      |
| 지엘팜 전용 래퍼              | `scripts/ecount_glpharm_runtime_core.py` |
| HNB 전용 래퍼                 | `scripts/ecount_hnb_runtime_core.py`     |

### 단계 크롤러 (`scripts/ecount_steps/`)

| 설명          | 경로                                                 |
| ------------- | ---------------------------------------------------- |
| 지엘 생산입고 | `scripts/ecount_steps/production_receipt_crawler.py` |
| 지엘 구매     | `scripts/ecount_steps/purchase_crawler.py`           |
| 지엘 판매     | `scripts/ecount_steps/sales_crawler.py`              |
| 지엘팜 구매   | `scripts/ecount_steps/glpharm_purchase_crawler.py`   |
| 지엘팜 판매   | `scripts/ecount_steps/glpharm_sales_crawler.py`      |
| HNB 구매      | `scripts/ecount_steps/hnb_purchase_crawler.py`       |
| HNB 판매      | `scripts/ecount_steps/hnb_sales_crawler.py`          |

### 정규화·저장

| 설명      | 경로                                              |
| --------- | ------------------------------------------------- |
| 생산입고  | `scripts/ecount_steps/production_receipt_core.py` |
| 구매 엑셀 | `scripts/ecount_steps/purchase_core.py`           |
| 판매 엑셀 | `scripts/ecount_steps/sales_core.py`              |

---

## 4. Supabase DB (마이그레이션 파일 주소)

| 테이블                                                        | 마이그레이션 경로                                                                  |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `ecount_production_receipt`                                   | `supabase/migrations/20260419193000_create_ecount_production_receipt.sql`          |
| 생산입고 `doc_date` 등                                        | `supabase/migrations/20260420170000_add_doc_date_to_ecount_production_receipt.sql` |
| `ecount_purchase_excel`                                       | `supabase/migrations/20260420173000_create_ecount_purchase_excel.sql`              |
| `ecount_sales_excel`                                          | `supabase/migrations/20260420196000_create_ecount_sales_excel.sql`                 |
| `ecount_glpharm_purchase_excel`, `ecount_glpharm_sales_excel` | `supabase/migrations/20260421013000_create_ecount_glpharm_excel_tables.sql`        |
| `ecount_hnb_purchase_excel`, `ecount_hnb_sales_excel`         | `supabase/migrations/20260421020000_create_ecount_hnb_excel_tables.sql`            |

**적재 구분**

- 지엘: 생산입고 `ecount_production_receipt` · 구매/판매는 공용 엑셀 스키마 테이블(`ecount_purchase_excel`, `ecount_sales_excel`) — `company_code`로 구분.
- 지엘팜: `ecount_glpharm_*` 전용 테이블.
- HNB: `ecount_hnb_*` 전용 테이블.

---

## 5. 실행 예시

```bash
# 지엘
python scripts/ecount_multi_pipeline.py --company gl --from YYYY-MM-DD --to YYYY-MM-DD

# 지엘팜
python scripts/ecount_glpharm_multi_pipeline.py --from YYYY-MM-DD --to YYYY-MM-DD

# HNB
python scripts/ecount_hnb_multi_pipeline.py --from YYYY-MM-DD --to YYYY-MM-DD
```

DB 없이 검증: 각 스크립트에 `--no-db` (지원하는 경우).

---

## 6. 관련 내부 문서

| 설명           | 경로                                       |
| -------------- | ------------------------------------------ |
| 핵심 기능 요약 | `docs/ecount-crawler-core-summary.md`      |
| 코드/DB 요약   | `docs/ecount-crawling-files-db-summary.md` |
| DB 타입        | `supabase/types.ts`                        |

---

## 7. 환경변수 (요약)

- 기업별: `ECOUNT_{GL|GLPHARM|HNB}_COM_CODE`, `USER_ID`, `USER_PW`
- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

---

_작성 기준: 리포지토리 내 크롤러·마이그레이션 구조_
