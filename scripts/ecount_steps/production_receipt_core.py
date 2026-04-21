from __future__ import annotations

import io
from datetime import datetime

import pandas as pd
import structlog
from supabase import Client

logger = structlog.get_logger()


def _hn_header_production(s: object) -> str:
    """헤더 공백 제거 정규화(엑셀/CSV 공통)."""
    return "".join(str(s).split())


PRODUCTION_RECEIPT_HEADER_MAP: dict[str, str] = {
    "입고번호": "receipt_no",
    "입고일자": "doc_date",
    "일자": "doc_date",
    "생산입고공장명": "factory_name",
    "받는창고명": "warehouse_name",
    "품목": "product_name",
    "수량": "qty",
    "작업지시서": "work_order",
}


def _df_production_renamed_from_columns(df: pd.DataFrame) -> pd.DataFrame | None:
    """원본 컬럼명으로 PRODUCTION_RECEIPT_HEADER_MAP 매핑."""
    df = df.copy()
    df.columns = [str(c).strip() for c in df.columns]
    norm_to_actual = {_hn_header_production(c): c for c in df.columns}
    rename: dict[str, str] = {}
    for src, dst in PRODUCTION_RECEIPT_HEADER_MAP.items():
        key = _hn_header_production(src)
        if key in norm_to_actual:
            rename[norm_to_actual[key]] = dst
    if not rename:
        return None
    return df[list(rename.keys())].rename(columns=rename)


def _records_from_renamed_production_df(
    df: pd.DataFrame,
    company_code: str,
    date_from: str,
    date_to: str,
) -> list[dict[str, object]]:
    # 변경 이유: 생산입고조회의 일자별 집계를 위해 doc_date를 항상 생성/정규화합니다.
    if "doc_date" not in df.columns and "receipt_no" in df.columns:
        extracted = (
            df["receipt_no"]
            .astype(str)
            .str.extract(r"^(?P<date>\d{2,4}[/-]\d{1,2}[/-]\d{1,2})")
        )
        df["doc_date"] = extracted["date"]

    if "doc_date" in df.columns:
        parsed = pd.to_datetime(
            df["doc_date"].astype(str).str.strip().str.replace(".", "/", regex=False),
            errors="coerce",
            format="%Y/%m/%d",
        )
        parsed_alt = pd.to_datetime(
            df["doc_date"].astype(str).str.strip().str.replace(".", "/", regex=False),
            errors="coerce",
            format="%y/%m/%d",
        )
        df["doc_date"] = parsed.fillna(parsed_alt)
        df = df.dropna(subset=["doc_date"]).copy()
        df["doc_date"] = df["doc_date"].dt.strftime("%Y-%m-%d")

    if "qty" in df.columns:
        df["qty"] = pd.to_numeric(
            df["qty"].astype(str).str.replace(",", "").str.strip(),
            errors="coerce",
        )
    df["company_code"] = company_code
    df["date_from"] = date_from
    df["date_to"] = date_to
    df["crawled_at"] = datetime.now().isoformat()

    if "receipt_no" in df.columns:
        df = df[df["receipt_no"].astype(str).str.strip() != ""].copy()

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
    print(f"[Ecount] 생산입고조회 정규화: {len(out)}행")
    return out


def normalize_production_receipt_csv_dataframe(
    raw: pd.DataFrame,
    company_code: str,
    date_from: str,
    date_to: str,
) -> list[dict[str, object]]:
    """변경 이유: CSV 첫 행 헤더를 엑셀과 동일 규칙으로 매핑해 Supabase 적재용 행을 만듭니다."""
    renamed = _df_production_renamed_from_columns(raw)
    if renamed is None:
        print("[Ecount] [WARN] 생산입고 CSV: 매칭된 컬럼 없음")
        return []
    return _records_from_renamed_production_df(renamed, company_code, date_from, date_to)


def normalize_production_receipt_xlsx(
    raw: bytes,
    company_code: str,
    date_from: str,
    date_to: str,
) -> list[dict[str, object]]:
    """생산입고조회 엑셀 -> Supabase 적재용 행."""
    if not raw or raw[:4] != b"PK\x03\x04":
        print("[Ecount] [WARN] 생산입고조회: XLSX가 아니거나 빈 파일")
        return []

    header_keys_norm = {_hn_header_production(k) for k in PRODUCTION_RECEIPT_HEADER_MAP}
    sheet = pd.read_excel(io.BytesIO(raw), header=None, engine="openpyxl")
    header_row_idx = None
    for i in range(min(len(sheet), 30)):
        row_norm = {
            _hn_header_production(v)
            for v in sheet.iloc[i].tolist()
            if pd.notna(v) and str(v).strip()
        }
        hits = len(row_norm & header_keys_norm)
        if hits >= 2:
            header_row_idx = i
            break
    if header_row_idx is None:
        print("[Ecount] [WARN] 생산입고조회 엑셀 헤더 행 탐지 실패")
        return []

    df = pd.read_excel(
        io.BytesIO(raw),
        header=header_row_idx,
        engine="openpyxl",
    )
    renamed = _df_production_renamed_from_columns(df)
    if renamed is None:
        print("[Ecount] [WARN] 생산입고조회: 매칭된 컬럼 없음")
        return []
    return _records_from_renamed_production_df(renamed, company_code, date_from, date_to)


async def replace_production_receipt_rows(
    supabase: Client,
    table_name: str,
    records: list[dict[str, object]],
    company_code: str,
    date_from: str,
    date_to: str,
    csv_cutoff_date: str = "2026-04-08",
) -> dict[str, object]:
    """동일 기업·조회기간 데이터 삭제 후 재삽입."""
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
            # 변경 이유: 중복키가 포함된 배치도 가능한 행은 계속 저장되도록 처리합니다.
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
