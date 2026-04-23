"""
ecount_crawler.py 자동 패치 (v2.8.1 → v2.8.3).

변경사항:
  [1] MENU_HASH 구조 확장 — menu_seq/group_seq를 메뉴별로 분리
      (지엘 재고수불부 URL 실측: MENUTREE_000215 / MENUTREE_000035 / E040702 / 4)
  [2] _DEFAULT_MENU_TREE 축소 — menu_type만 공통
  [3] _nav_block 단순화 — hash_base 전체를 스프레드
  [4] 지엘팜 날짜 포맷 %Y/%m/%d 추가 (실측 'YYYY/MM/DD')
  [5] _apply_date_filter 검색 후 "조회품목 재지정" 팝업 '취소' 자동 클릭
  [6] _download_excel Excel 클릭 후 "CSV 제공" 알림 '확인' 자동 클릭
  [7] _normalize_xlsx에 CSV 분기 추가 (재고수불부 1만건+ 대응)
  [8] 재고수불부 CSV 전용 파서 _normalize_stock_ledger_csv 신규

실행:
  cd C:\\Users\\user\\Desktop\\gl-project\\gl-dashboard\\scripts
  python apply_patch_v2_8_3.py

동작:
  - 현재 ecount_crawler.py → ecount_crawler.py.bak 백업
  - 각 치환 블록 정확 매칭 실패 시 에러 + 롤백
  - 성공 시 원본 대체
"""
import os
import shutil
import sys
from datetime import datetime

TARGET = "ecount_crawler.py"

# ──────────────────────────────────────────────
# 치환 블록 정의 — (description, old_text, new_text)
# old_text 는 현재 파일에 정확히 1회 존재해야 함
# ──────────────────────────────────────────────
PATCHES = []


# [1] MENU_HASH 구조 확장
PATCHES.append((
    "MENU_HASH 구조 확장 (메뉴별 완전 nav 세트)",
    '''# 메뉴 해시 (prg_id + depth). 기업 공통. 기업별 override는 env로.
MENU_HASH: dict[EcountMenu, dict[str, str]] = {
    EcountMenu.구매현황: {"prg_id": "E040305", "depth": "4"},
    EcountMenu.판매현황: {"prg_id": "E040207", "depth": "4"},
    EcountMenu.재고수불부: {"prg_id": "C000035", "depth": "2"},
}

_DEFAULT_MENU_TREE: dict[str, str] = {
    "menu_type": "MENUTREE_000004",
    "menu_seq": "MENUTREE_000513",
    "group_seq": "MENUTREE_000031",
}''',
    '''# 메뉴 해시 — 각 메뉴가 완전한 nav 세트 보유.
# 실측: menu_seq / group_seq 도 메뉴별로 다름 (v2.8.3 수정)
#   구매현황:   MENUTREE_000513 / MENUTREE_000031 / E040305 / 4
#   판매현황:   (실측 필요 — 일단 구매와 동일 값 사용)
#   재고수불부: MENUTREE_000215 / MENUTREE_000035 / E040702 / 4
MENU_HASH: dict[EcountMenu, dict[str, str]] = {
    EcountMenu.구매현황: {
        "menu_seq": "MENUTREE_000513",
        "group_seq": "MENUTREE_000031",
        "prg_id": "E040305",
        "depth": "4",
    },
    EcountMenu.판매현황: {
        "menu_seq": "MENUTREE_000513",
        "group_seq": "MENUTREE_000031",
        "prg_id": "E040207",
        "depth": "4",
    },
    EcountMenu.재고수불부: {
        "menu_seq": "MENUTREE_000215",
        "group_seq": "MENUTREE_000035",
        "prg_id": "E040702",
        "depth": "4",
    },
}

_DEFAULT_MENU_TREE: dict[str, str] = {
    "menu_type": "MENUTREE_000004",  # menu_type만 공통값
}''',
))


# [3] _nav_block 단순화
PATCHES.append((
    "_nav_block — hash_base 전체 스프레드",
    '''def _nav_block(prefix: str, block: str, menu: EcountMenu) -> dict[str, str]:
    hash_base = MENU_HASH[menu]
    result = {
        **_DEFAULT_MENU_TREE,
        "prg_id": hash_base["prg_id"],
        "depth": hash_base["depth"],
    }''',
    '''def _nav_block(prefix: str, block: str, menu: EcountMenu) -> dict[str, str]:
    hash_base = MENU_HASH[menu]
    # v2.8.3: hash_base가 menu_seq/group_seq 포함한 완전 세트
    result = {
        **_DEFAULT_MENU_TREE,
        **hash_base,
    }''',
))


# [5] 검색 후 "조회품목 재지정" 팝업 '취소'
PATCHES.append((
    "_apply_date_filter — 검색 후 팝업 '취소' 자동 클릭",
    '''        if not clicked:
            await page.keyboard.press("F8")
        print(f"[Ecount] 날짜 필터 적용: 시작 {y1}/{m1} (나머지 UI 기본값)")
        # [최적화 v2.6] 검색 후 그리드 렌더 대기 2.0 → 1.0
        # (엑셀 다운로드 단계에서 추가 대기가 있으므로 과하게 기다릴 필요 없음)
        await asyncio.sleep(1.0)

    except Exception as e:
        print(f"[Ecount] 날짜 필터 실패: {e}")''',
    '''        if not clicked:
            await page.keyboard.press("F8")
        print(f"[Ecount] 날짜 필터 적용: 시작 {y1}/{m1} (나머지 UI 기본값)")
        # [최적화 v2.6] 검색 후 그리드 렌더 대기 2.0 → 1.0
        await asyncio.sleep(1.0)

        # v2.8.3: 재고수불부 "조회품목 재지정" 팝업 자동 '취소' 클릭
        # "품목개수가 많을 경우 검색시간이 오래 걸릴 수 있습니다.
        #  조회품목을 재지정하겠습니까?" [확인 / 취소]
        # 취소 = 전체 조회 유지
        try:
            popped = await page.evaluate(
                r"""() => {
                    const all = [...document.querySelectorAll('body *')];
                    const target = all.find(el => {
                        const t = (el.innerText || '').replace(/\\s+/g, '');
                        return t.includes('조회품목을재지정') && el.offsetParent !== null;
                    });
                    if (!target) return null;
                    let container = target;
                    for (let i = 0; i < 5 && container; i++) {
                        const btns = [...container.querySelectorAll('button, a')];
                        const cancel = btns.find(b => (b.innerText || '').trim() === '취소');
                        if (cancel) { cancel.click(); return '취소'; }
                        container = container.parentElement;
                    }
                    return null;
                }"""
            )
            if popped:
                print(f"[Ecount] 검색 후 '조회품목 재지정' 팝업 → '{popped}' 클릭")
                await asyncio.sleep(0.8)
        except Exception as e:
            print(f"[Ecount] 검색 후 팝업 처리 예외(무시): {e}")

    except Exception as e:
        print(f"[Ecount] 날짜 필터 실패: {e}")''',
))


# [6] Excel 버튼 클릭 후 "CSV 제공" 알림 '확인'
PATCHES.append((
    "_download_excel — CSV 알림 '확인' 자동 클릭",
    '''        download: Download = await dl_info.value
        path = await download.path()
        if not path:
            return None
        with open(path, "rb") as f:
            data = f.read()
        print(f"[Ecount] 엑셀 다운로드 완료: {len(data):,} bytes")''',
    '''        # v2.8.3: 1만건+ 알림 팝업 '확인' 자동 클릭
        # "만 건 이상의 경우 엑셀(CSV 파일형식)데이터로 제공됩니다." [확인]
        # 다운로드 트리거 직후 약간 대기 후 팝업 감지 (비동기)
        try:
            await asyncio.sleep(0.4)
            popped = await page.evaluate(
                r"""() => {
                    const all = [...document.querySelectorAll('body *')];
                    const target = all.find(el => {
                        const t = (el.innerText || '').replace(/\\s+/g, '');
                        return (t.includes('CSV파일형식') || t.includes('만건이상')) &&
                               el.offsetParent !== null;
                    });
                    if (!target) return null;
                    let container = target;
                    for (let i = 0; i < 5 && container; i++) {
                        const btns = [...container.querySelectorAll('button, a')];
                        const ok = btns.find(b => (b.innerText || '').trim() === '확인');
                        if (ok) { ok.click(); return '확인'; }
                        container = container.parentElement;
                    }
                    return null;
                }"""
            )
            if popped:
                print(f"[Ecount] CSV 제공 알림 → '{popped}' 클릭")
        except Exception as e:
            print(f"[Ecount] CSV 알림 처리 예외(무시): {e}")

        download: Download = await dl_info.value
        path = await download.path()
        if not path:
            return None
        with open(path, "rb") as f:
            data = f.read()
        print(f"[Ecount] 다운로드 완료: {len(data):,} bytes")''',
))


# [7] _normalize_xlsx 진입부 — CSV/XLSX 분기
PATCHES.append((
    "_normalize_xlsx — CSV 분기 진입",
    '''    if not xlsx_bytes:
        return []

    col_map = COLUMN_NORMALIZE.get(company_code, {}).get(menu.value)
    if not col_map:
        print(f"[Ecount] ⚠️ 정규화 맵 없음: {company_code}/{menu.value}")
        return []''',
    '''    if not xlsx_bytes:
        return []

    # v2.8.3: 재고수불부는 1만건+ 시 CSV로 내려옴 — 매직바이트로 판정
    # XLSX: PK\\x03\\x04 (ZIP), CSV: UTF-8 BOM (EF BB BF) 또는 일반 텍스트
    is_xlsx = xlsx_bytes[:4] == b"PK\\x03\\x04"
    if not is_xlsx and menu == EcountMenu.재고수불부:
        return _normalize_stock_ledger_csv(
            xlsx_bytes, company_code, date_from, date_to, allowed_erp_codes
        )
    if not is_xlsx:
        print(
            f"[Ecount] ⚠️ 비-XLSX 데이터 수신 ({company_code}/{menu.value}) — "
            "CSV 파서 미구현"
        )
        return []

    col_map = COLUMN_NORMALIZE.get(company_code, {}).get(menu.value)
    if not col_map:
        print(f"[Ecount] ⚠️ 정규화 맵 없음: {company_code}/{menu.value}")
        return []''',
))


# [8] 지엘팜 날짜 포맷 %Y/%m/%d 추가 (+ 재고수불부 CSV 파서 신규 함수)
# 기존 v2.8.1 패치 블록을 찾아서 3포맷 시도로 교체
PATCHES.append((
    "doc_date 파싱 — 3포맷 순차 시도 (지엘팜 YYYY/MM/DD 실측 반영)",
    '''            # 명시적 포맷 순차 시도 (format='mixed'의 dayfirst 오인 방지)
            # %y/%m/%d 먼저 (지엘/HNB), 실패한 행만 %Y-%m-%d (지엘팜) 시도
            date_str = extracted["date"]
            d1 = pd.to_datetime(date_str, errors="coerce", format="%y/%m/%d")
            d2 = pd.to_datetime(date_str, errors="coerce", format="%Y-%m-%d")
            df["doc_date"] = d1.fillna(d2)''',
    '''            # v2.8.3: 실측 포맷 3종 순차 시도
            #   %y/%m/%d  — 지엘 구매 (24/01/02)
            #   %Y/%m/%d  — 지엘팜 구매/판매 (2024/01/02) ← 신규
            #   %Y-%m-%d  — 예비 (하이픈 형식)
            date_str = extracted["date"]
            d1 = pd.to_datetime(date_str, errors="coerce", format="%y/%m/%d")
            d2 = pd.to_datetime(date_str, errors="coerce", format="%Y/%m/%d")
            d3 = pd.to_datetime(date_str, errors="coerce", format="%Y-%m-%d")
            df["doc_date"] = d1.fillna(d2).fillna(d3)''',
))


# 재고수불부 CSV 파서 — 기존 _normalize_xlsx 함수 끝 부분 앞에 신규 함수 삽입
# 마커: fetch_allowed_erp_codes 함수 직전
PATCHES.append((
    "_normalize_stock_ledger_csv 신규 함수 삽입",
    '''# ──────────────────────────────────────────────
# Supabase — item_erp_mapping 조회 + 기간 replace 저장
# ──────────────────────────────────────────────
def fetch_allowed_erp_codes(''',
    '''# ──────────────────────────────────────────────
# v2.8.3: 재고수불부 CSV 전용 파서
# 1만건+ 시 이카운트가 CSV로 제공 (UTF-8 BOM + CRLF, 탭 접미사 포함).
# 구조: 품목별 섹션 반복
#   "회사명 : (주)지엘 / ... / 재고수불부 / 품목명 [단위] (erp_code)"
#   "일자", "거래처명", "적요", "입고수량", "출고수량", "재고수량", ""
#   ... 데이터 행 ...
#   "2026/04/19 오전 2:40:14"   ← 생성 타임스탬프 (섹션 구분자)
#   ""                              ← 빈 줄
# ──────────────────────────────────────────────
def _normalize_stock_ledger_csv(
    csv_bytes: bytes,
    company_code: str,
    date_from: str,
    date_to: str,
    allowed_erp_codes: set[str] | None,
) -> list[dict]:
    import csv
    import re
    import io as _io

    text = csv_bytes.decode("utf-8-sig", errors="replace")
    reader = csv.reader(_io.StringIO(text))

    # 섹션 헤더 regex — "품목명 [단위] (GL00002)" 패턴
    section_re = re.compile(r"재고수불부\\s*/\\s*(.+?)\\s*\\[(.+?)\\]\\s*\\((\\S+)\\)")

    current_erp = None
    current_name = None
    in_data = False  # 컬럼 헤더 이후 데이터 섹션
    records: list[dict] = []
    section_count = 0
    skipped_erp = 0

    # 컬럼 헤더 시그니처 (공백/탭 제거 후 비교)
    def _clean(s: str) -> str:
        return s.replace("\\t", "").strip() if s else ""

    for row in reader:
        if not row:
            in_data = False
            continue

        first = _clean(row[0])

        # 섹션 헤더 감지
        m = section_re.search(first)
        if m:
            current_name = m.group(1).strip()
            current_erp = m.group(3).strip()
            in_data = False
            section_count += 1
            continue

        # 컬럼 헤더 감지 ("일자", "거래처명", ...)
        if first == "일자":
            in_data = True
            continue

        # 타임스탬프 섹션 구분자 (YYYY/MM/DD 오전/오후 ...)
        if re.match(r"^\\d{4}/\\d{2}/\\d{2}\\s+(오전|오후)", first):
            in_data = False
            continue

        if not in_data or current_erp is None:
            continue

        # 데이터 행 파싱
        # 컬럼 순서: 일자, 거래처명, 적요, 입고수량, 출고수량, 재고수량, (기타), (기타)
        vals = [_clean(c) for c in row]
        while len(vals) < 6:
            vals.append("")

        date_s = vals[0]
        counterparty = vals[1] or None
        memo = vals[2] or None
        inbound = vals[3]
        outbound = vals[4]

        # '전일재고'/'합계' 같은 집계 행 → memo 컬럼에 값 있음 but 날짜 없음
        # 실제 트랜잭션은 date_s 있어야 함. 없으면 스킵.
        if not date_s:
            continue

        # 품목 필터 (allowed 지정되면 적용)
        if allowed_erp_codes is not None and current_erp not in allowed_erp_codes:
            skipped_erp += 1
            continue

        # 숫자 변환
        def _to_num(s: str) -> float | None:
            if not s:
                return None
            try:
                return float(s.replace(",", ""))
            except ValueError:
                return None

        records.append({
            "doc_date": date_s,  # 포맷 정규화는 아래 일괄
            "counterparty": counterparty,
            "memo": f"[품목: {current_erp} {current_name}] {memo or ''}".strip(),
            "inbound_qty": _to_num(inbound),
            "outbound_qty": _to_num(outbound),
            "company_code": company_code,
            "date_from": date_from,
            "date_to": date_to,
        })

    # doc_date 포맷 정규화 (YYYY/MM/DD → YYYY-MM-DD)
    import pandas as _pd
    if records:
        df = _pd.DataFrame(records)
        s = df["doc_date"].astype(str).str.strip()
        d1 = _pd.to_datetime(s, errors="coerce", format="%Y/%m/%d")
        d2 = _pd.to_datetime(s, errors="coerce", format="%y/%m/%d")
        df["doc_date"] = d1.fillna(d2)
        nat_count = int(df["doc_date"].isna().sum())
        if nat_count > 0:
            print(f"[Ecount] CSV doc_date 파싱 실패 {nat_count}행 drop")
            df = df.dropna(subset=["doc_date"]).copy()
        df["doc_date"] = df["doc_date"].dt.strftime("%Y-%m-%d")
        records = df.to_dict(orient="records")

    print(
        f"[Ecount] CSV 재고수불부 파싱 완료: "
        f"섹션 {section_count}개, 레코드 {len(records)}행"
        + (f", 품목 필터 제외 {skipped_erp}행" if skipped_erp else "")
    )
    return records


# ──────────────────────────────────────────────
# Supabase — item_erp_mapping 조회 + 기간 replace 저장
# ──────────────────────────────────────────────
def fetch_allowed_erp_codes(''',
))


# ──────────────────────────────────────────────
# 실행부
# ──────────────────────────────────────────────
def main():
    if not os.path.exists(TARGET):
        print(f"❌ 파일 없음: {TARGET}")
        print(f"   현재 경로: {os.getcwd()}")
        print(f"   scripts/ 디렉토리에서 실행하거나 TARGET 경로 수정 필요")
        sys.exit(1)

    # 백업
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = f"{TARGET}.bak_{ts}"
    shutil.copy2(TARGET, backup)
    print(f"✓ 백업 생성: {backup}")

    with open(TARGET, "r", encoding="utf-8") as f:
        src = f.read()

    original_src = src
    applied = 0

    for i, (desc, old, new) in enumerate(PATCHES, 1):
        count = src.count(old)
        if count == 0:
            print(f"❌ [{i}/{len(PATCHES)}] {desc}")
            print(f"   패턴 매칭 실패 — 이미 적용됐거나 파일 형태가 다름")
            print(f"   롤백 후 종료")
            with open(TARGET, "w", encoding="utf-8") as f:
                f.write(original_src)
            sys.exit(2)
        elif count > 1:
            print(f"❌ [{i}/{len(PATCHES)}] {desc}")
            print(f"   패턴이 {count}회 매칭 — 모호. 수동 패치 필요")
            with open(TARGET, "w", encoding="utf-8") as f:
                f.write(original_src)
            sys.exit(3)
        else:
            src = src.replace(old, new, 1)
            print(f"✓ [{i}/{len(PATCHES)}] {desc}")
            applied += 1

    with open(TARGET, "w", encoding="utf-8") as f:
        f.write(src)

    print(f"\n🎉 패치 완료 — {applied}/{len(PATCHES)} 블록 적용")
    print(f"   백업: {backup}")
    print(f"   문제 시: mv {backup} {TARGET} 로 복원\n")
    print("다음 검증 커맨드:")
    print("  python ecount_crawler.py --company gl --menu stock_ledger --no-db")
    print("  python ecount_crawler.py --company gl_pharm --menu purchase --no-db")


if __name__ == "__main__":
    main()
