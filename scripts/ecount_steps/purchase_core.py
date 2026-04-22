from __future__ import annotations

import io
from datetime import datetime

import pandas as pd
import structlog
from supabase import Client

logger = structlog.get_logger()

def _hn_header(s: object) -> str:
    """헤더 공백 제거 정규화(엑셀/CSV 공통)."""
    return "".join(str(s).split())


PURCHASE_EXCEL_HEADER_MAP: dict[str, str] = {
    "년/월/일": "doc_date",
    "일자-No.": "doc_date",
    "품목코드": "erp_code",
    "품명 및 규격": "product_name",
    "품목명(규격)": "product_name",
    "수량": "qty",
    "단가": "unit_price",
    "포함단가": "unit_price_vat",
    "단가(vat포함)": "unit_price_vat",
    "공급가액": "supply_amount",
    "부가세": "vat_amount",
    "합계": "total_amount",
    "합 계": "total_amount",
    "적요": "memo",
    "구매처명": "counterparty",
    "거래처명": "counterparty",
}


def _records_from_renamed_purchase_df(
    df: pd.DataFrame,
    company_code: str,
    date_from: str,
    date_to: str,
) -> list[dict[str, object]]:
    """이미 PURCHASE_EXCEL_HEADER_MAP으로 rename 완료된 DataFrame -> 레코드."""
    if "doc_date" in df.columns:
        extracted = df["doc_date"].astype(str).str.strip().str.extract(
            r"^(?P<date>.+?)\s*(?:-\s*(?P<no>\d+))?\s*$"
        )
        if extracted["no"].notna().any():
            df["doc_no"] = extracted["no"].where(extracted["no"].notna(), None)
        date_s = extracted["date"].astype(str).str.replace(".", "/", regex=False)
        d1 = pd.to_datetime(date_s, errors="coerce", format="%y/%m/%d")
        d2 = pd.to_datetime(date_s, errors="coerce", format="%Y/%m/%d")
        d3 = pd.to_datetime(date_s, errors="coerce", format="%Y-%m-%d")
        d4 = pd.to_datetime(date_s, errors="coerce", format="%Y%m%d")
        d5 = pd.to_datetime(date_s, errors="coerce", format="%y%m%d")
        # 변경 이유: CSV 일자값이 20240102-1 같은 형식일 때도 YYYYMMDD를 인식해 적재되도록 합니다.
        df["doc_date"] = d1.fillna(d2).fillna(d3).fillna(d4).fillna(d5)
        df = df.dropna(subset=["doc_date"]).copy()
        df["doc_date"] = df["doc_date"].dt.strftime("%Y-%m-%d")

    for col in (
        "qty",
        "unit_price",
        "unit_price_vat",
        "supply_amount",
        "vat_amount",
        "total_amount",
    ):
        if col in df.columns:
            df[col] = pd.to_numeric(
                df[col].astype(str).str.replace(",", "").str.strip(),
                errors="coerce",
            )

    if "erp_code" in df.columns:
        df["erp_code"] = df["erp_code"].astype(str).str.strip()

    df["company_code"] = company_code
    df["date_from"] = date_from
    df["date_to"] = date_to
    df["crawled_at"] = datetime.now().isoformat()

    if "doc_date" in df.columns:
        df = df[df["doc_date"].astype(str).str.strip() != ""].copy()

    df = df.where(pd.notna(df), None)
    out: list[dict[str, object]] = []
    for rec in df.to_dict(orient="records"):
        row: dict[str, object] = {}
        for k, v in rec.items():
            key = str(k)
            if hasattr(v, "item"):
                try:
                    val = v.item()
                except Exception:
                    val = None
            else:
                val = v
            if val is not None and pd.isna(val):
                val = None
            row[key] = val
        out.append(row)
    print(f"[Ecount] 구매현황 정규화: {len(out)}행")
    return out


def normalize_purchase_csv_dataframe(
    raw: pd.DataFrame,
    company_code: str,
    date_from: str,
    date_to: str,
) -> list[dict[str, object]]:
    """변경 이유: CSV 첫 행 헤더를 엑셀과 동일 규칙으로 매핑해 Supabase 적재용 행을 만듭니다."""
    df = raw.copy()
    df.columns = [str(c).strip() for c in df.columns]
    norm_to_actual = {_hn_header(c): c for c in df.columns}
    rename: dict[str, str] = {}
    for src, dst in PURCHASE_EXCEL_HEADER_MAP.items():
        key = _hn_header(src)
        if key in norm_to_actual:
            rename[norm_to_actual[key]] = dst
    if not rename:
        print("[Ecount] [WARN] 구매 CSV: 매칭된 컬럼 없음")
        return []
    df = df[list(rename.keys())].rename(columns=rename)
    return _records_from_renamed_purchase_df(df, company_code, date_from, date_to)


def normalize_purchase_excel_xlsx(
    raw: bytes,
    company_code: str,
    date_from: str,
    date_to: str,
) -> list[dict[str, object]]:
    """구매현황 엑셀 -> ecount_purchase 적재용 행."""
    if not raw or raw[:4] != b"PK\x03\x04":
        print("[Ecount] [WARN] 구매현황: XLSX가 아니거나 빈 파일")
        return []

    header_keys_norm = {_hn_header(k) for k in PURCHASE_EXCEL_HEADER_MAP}
    sheet = pd.read_excel(io.BytesIO(raw), header=None, engine="openpyxl")
    header_row_idx = None
    for i in range(min(len(sheet), 30)):
        row_norm = {
            _hn_header(v)
            for v in sheet.iloc[i].tolist()
            if pd.notna(v) and str(v).strip()
        }
        if len(row_norm & header_keys_norm) >= 3:
            header_row_idx = i
            break
    if header_row_idx is None:
        print("[Ecount] [WARN] 구매현황 엑셀 헤더 행 탐지 실패")
        return []

    df = pd.read_excel(io.BytesIO(raw), header=header_row_idx, engine="openpyxl")
    df.columns = [str(c).strip() for c in df.columns]
    norm_to_actual = {_hn_header(c): c for c in df.columns}

    rename: dict[str, str] = {}
    for src, dst in PURCHASE_EXCEL_HEADER_MAP.items():
        key = _hn_header(src)
        if key in norm_to_actual:
            rename[norm_to_actual[key]] = dst
    if not rename:
        print("[Ecount] [WARN] 구매현황: 매칭된 컬럼 없음")
        return []

    df = df[list(rename.keys())].rename(columns=rename)
    return _records_from_renamed_purchase_df(df, company_code, date_from, date_to)


async def replace_purchase_excel_rows(
    supabase: Client,
    table_name: str,
    records: list[dict[str, object]],
    company_code: str,
    date_from: str,
    date_to: str,
    csv_cutoff_date: str = "2026-04-08",
) -> dict[str, object]:
    """구매현황 엑셀 행을 기간 단위로 교체 저장."""
    if not records:
        return {"inserted": 0, "deleted": 0, "error": None}

    deleted = 0
    try:
        del_res = (
            supabase.table(table_name)
            .delete(count="exact")
            .eq("company_code", company_code)
            .eq("date_from", date_from)
            .eq("date_to", date_to)
            .execute()
        )
        deleted = int(getattr(del_res, "count", None) or 0)
        print(f"[Supabase] {table_name} 기간별 삭제: {deleted}행")
    except Exception as e:
        logger.error("supabase_delete_failed", table=table_name, error=str(e))
        return {"inserted": 0, "deleted": 0, "error": f"delete: {e}"}

    batch = 300
    total = 0
    skipped_duplicates = 0
    try:
        for i in range(0, len(records), batch):
            chunk = records[i : i + batch]
            # 변경 이유: 배치 업서트 실패 시 중복 행만 건너뛰고 나머지 행 저장을 이어갑니다.
            try:
                supabase.table(table_name).upsert(chunk).execute()
                total += len(chunk)
            except Exception as batch_error:
                if "23505" not in str(batch_error):
                    raise
                for row in chunk:
                    try:
                        supabase.table(table_name).upsert([row]).execute()
                        total += 1
                    except Exception as row_error:
                        if "23505" in str(row_error):
                            skipped_duplicates += 1
                            continue
                        raise
            print(f"[Supabase] {table_name} upsert: {total}/{len(records)}")
        if skipped_duplicates:
            print(f"[Supabase] {table_name} 중복 스킵: {skipped_duplicates}행")
        return {"inserted": total, "deleted": deleted, "error": None}
    except Exception as e:
        logger.error("supabase_insert_failed", table=table_name, error=str(e))
        return {"inserted": total, "deleted": deleted, "error": f"insert: {e}"}
