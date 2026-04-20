from __future__ import annotations

import io
from datetime import datetime

import pandas as pd
import structlog
from supabase import Client

logger = structlog.get_logger()


def _read_excel_with_fallback(raw: bytes, header: int | None):
    """
    변경 이유: 일부 ERP 엑셀은 스타일 XML이 깨져 openpyxl 파싱이 실패해 calamine으로 폴백합니다.
    """
    try:
        return pd.read_excel(io.BytesIO(raw), header=header, engine="openpyxl")
    except Exception as first_error:
        try:
            return pd.read_excel(io.BytesIO(raw), header=header, engine="calamine")
        except Exception as second_error:
            print(f"[Ecount] [ERROR] 판매현황 엑셀 파싱 실패(openpyxl/calamine): {first_error} | {second_error}")
            raise

SALES_EXCEL_HEADER_MAP: dict[str, str] = {
    "년/월/일": "doc_date",
    "일자-No.": "doc_date",
    "일자-No": "doc_date",
    "일자/No.": "doc_date",
    "일자/No": "doc_date",
    "일자/NO": "doc_date",
    "일자": "doc_date",
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
    "적요": "memo",
    "판매처명": "counterparty",
    "거래처명": "counterparty",
}


def normalize_sales_excel_xlsx(
    raw: bytes,
    company_code: str,
    date_from: str,
    date_to: str,
) -> list[dict[str, object]]:
    """판매현황 엑셀 -> ecount_sales_excel 적재용 행."""
    if not raw or raw[:4] != b"PK\x03\x04":
        print("[Ecount] [WARN] 판매현황: XLSX가 아니거나 빈 파일")
        return []

    def _hn(s: object) -> str:
        return "".join(str(s).split())

    header_keys_norm = {_hn(k) for k in SALES_EXCEL_HEADER_MAP}
    sheet = _read_excel_with_fallback(raw, header=None)
    header_row_idx = None
    for i in range(min(len(sheet), 30)):
        row_norm = {
            _hn(v)
            for v in sheet.iloc[i].tolist()
            if pd.notna(v) and str(v).strip()
        }
        if len(row_norm & header_keys_norm) >= 3:
            header_row_idx = i
            break
    if header_row_idx is None:
        print("[Ecount] [WARN] 판매현황 엑셀 헤더 행 탐지 실패")
        return []

    df = _read_excel_with_fallback(raw, header=header_row_idx)
    df.columns = [str(c).strip() for c in df.columns]
    norm_to_actual = {_hn(c): c for c in df.columns}

    rename: dict[str, str] = {}
    for src, dst in SALES_EXCEL_HEADER_MAP.items():
        key = _hn(src)
        if key in norm_to_actual:
            rename[norm_to_actual[key]] = dst
    if not rename:
        print("[Ecount] [WARN] 판매현황: 매칭된 컬럼 없음")
        return []

    # 변경 이유: 판매현황 엑셀마다 일자 헤더 표기가 달라 누락되는 경우가 있어 첫 컬럼을 doc_date로 폴백합니다.
    selected_cols = list(rename.keys())
    if "doc_date" not in rename.values() and len(df.columns) > 0:
        first_col = str(df.columns[0])
        if first_col not in selected_cols:
            selected_cols.insert(0, first_col)
        rename[first_col] = "doc_date"

    df = df[selected_cols].rename(columns=rename)

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
        df["doc_date"] = d1.fillna(d2).fillna(d3)
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
    print(f"[Ecount] 판매현황 정규화: {len(out)}행")
    return out


async def replace_sales_excel_rows(
    supabase: Client,
    table_name: str,
    records: list[dict[str, object]],
    company_code: str,
    date_from: str,
    date_to: str,
) -> dict[str, object]:
    """판매현황 엑셀 행을 기간 단위로 교체 저장."""
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
    try:
        for i in range(0, len(records), batch):
            chunk = records[i : i + batch]
            supabase.table(table_name).insert(chunk).execute()
            total += len(chunk)
            print(f"[Supabase] {table_name} insert: {total}/{len(records)}")
        return {"inserted": total, "deleted": deleted, "error": None}
    except Exception as e:
        logger.error("supabase_insert_failed", table=table_name, error=str(e))
        return {"inserted": total, "deleted": deleted, "error": f"insert: {e}"}
