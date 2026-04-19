"""
바이박스 CSV 5개를 Supabase `bi_box_daily` 테이블로 백필 업로드.

PM 정책 (20260418-pm-status-for-jungmin-v2.md §4):
  - PK: (date, sku_id, vendor_item_id)
  - 순수 중복 73건: drop_duplicates로 제거
  - 시점 중복 16건: PK 기준 groupby → bi_box_share 평균, 나머지 컬럼은 first

실행:
  dry-run  : python -m data_pipeline.bi_box_supabase_uploader
  실제 적용: python -m data_pipeline.bi_box_supabase_uploader --apply
"""
from __future__ import annotations

import argparse
import glob
import os
import sys
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parents[3]
BI_BOX_DIR = PROJECT_ROOT / "data" / "raw" / "coupang" / "bi_box"
BATCH_SIZE = 200

COLUMN_MAP = {
    "날짜": "date",
    "SKU ID": "sku_id",
    "SKU Name": "sku_name",
    "벤더아이템 ID": "vendor_item_id",
    "VIID 명": "vendor_item_name",
    "최저가": "min_price",
    "중간가": "mid_price",
    "최고가": "max_price",
    "바이박스 점유율": "bi_box_share",
    "재고 없음": "is_stockout",
    "단위가격 조건": "unit_price_ok",
    "개당가격 조건": "per_piece_price_ok",
    "상품속성 오류": "attribute_error",
}
PK_COLS = ["date", "sku_id", "vendor_item_id"]


def load_and_normalize() -> pd.DataFrame:
    """5개 CSV 로드 → 컬럼 rename → 타입 변환 → 원본 파일명 기록."""
    files = sorted(BI_BOX_DIR.glob("*.csv"))
    frames = []
    for f in files:
        df = pd.read_csv(f)
        df = df.rename(columns=COLUMN_MAP)
        df["source_file"] = f.name
        frames.append(df)
    df = pd.concat(frames, ignore_index=True)

    df["date"] = pd.to_datetime(df["date"].astype(str), format="%Y%m%d").dt.strftime("%Y-%m-%d")
    df["sku_id"] = df["sku_id"].astype(str)
    df["vendor_item_id"] = df["vendor_item_id"].astype(str)
    df["bi_box_share"] = (
        df["bi_box_share"].astype(str).str.rstrip("%").astype(float)
    )
    for bool_col in ("is_stockout", "unit_price_ok", "per_piece_price_ok", "attribute_error"):
        df[bool_col] = df[bool_col].astype(bool)
    return df


def dedup_option_b(df: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, int]]:
    """
    옵션 B: 순수 중복 제거 + PK 중복 시 bi_box_share 평균.
    반환: (dedup_df, stats)
    """
    stats = {"raw": len(df)}

    # 1단계: 전체 컬럼 동일한 순수 중복 제거
    df1 = df.drop_duplicates()
    stats["after_pure_dedup"] = len(df1)
    stats["pure_duplicates_removed"] = stats["raw"] - stats["after_pure_dedup"]

    # 2단계: PK 그룹 중 2건 이상 남은 경우 → bi_box_share 평균, 나머지 first
    pk_counts = df1.groupby(PK_COLS).size()
    duplicated_pks = (pk_counts > 1).sum()
    stats["pk_groups_with_time_duplicates"] = int(duplicated_pks)

    numeric_cols = ["min_price", "mid_price", "max_price", "bi_box_share"]
    other_cols = [c for c in df1.columns if c not in PK_COLS and c not in numeric_cols]

    agg_spec = {"bi_box_share": "mean"}
    for c in ("min_price", "mid_price", "max_price"):
        agg_spec[c] = "mean"
    for c in other_cols:
        agg_spec[c] = "first"

    df2 = df1.groupby(PK_COLS, as_index=False).agg(agg_spec)
    stats["final_rows"] = len(df2)
    return df2, stats


def to_records(df: pd.DataFrame) -> list[dict]:
    """DataFrame → Supabase insert용 dict 리스트."""
    records = df.where(pd.notna(df), None).to_dict(orient="records")
    for r in records:
        for k in ("min_price", "mid_price", "max_price", "bi_box_share"):
            v = r.get(k)
            if v is not None:
                r[k] = float(v)
        for k in ("is_stockout", "unit_price_ok", "per_piece_price_ok", "attribute_error"):
            v = r.get(k)
            if v is not None:
                r[k] = bool(v)
    return records


def upload_to_supabase(records: list[dict]) -> int:
    """배치 INSERT. 성공한 총 행수 반환."""
    load_dotenv(PROJECT_ROOT / ".env")
    from supabase import create_client

    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수 필요")

    sb = create_client(url, key)
    total = 0
    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i : i + BATCH_SIZE]
        sb.table("bi_box_daily").insert(batch).execute()
        total += len(batch)
        print(f"  진행: {total}/{len(records)}", flush=True)
    return total


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="실제 Supabase INSERT 실행")
    args = parser.parse_args()

    print("=" * 60)
    print("바이박스 → bi_box_daily 백필 업로더")
    print("=" * 60)

    df = load_and_normalize()
    print(f"\n[1] 5개 CSV 로드 완료: {len(df):,}행")
    print(f"   기간: {df['date'].min()} ~ {df['date'].max()}")

    dedup_df, stats = dedup_option_b(df)
    print(f"\n[2] 옵션 B dedup 결과:")
    print(f"   원본               : {stats['raw']:,}행")
    print(f"   순수 중복 제거 후   : {stats['after_pure_dedup']:,}행 (-{stats['pure_duplicates_removed']})")
    print(f"   PK 시점 중복 그룹  : {stats['pk_groups_with_time_duplicates']}개")
    print(f"   최종 행수          : {stats['final_rows']:,}행")

    final_pk_dups = dedup_df.duplicated(subset=PK_COLS).sum()
    print(f"\n[3] 최종 PK 중복 검증: {final_pk_dups}건 (0이어야 함)")
    assert final_pk_dups == 0, "PK 중복이 남아있음. dedup 로직 확인 필요"

    records = to_records(dedup_df)
    print(f"\n[4] records 준비 완료: {len(records):,}개")

    if not args.apply:
        print("\n[DRY-RUN] --apply 플래그 없이 실행되어 실제 INSERT 생략")
        print("실제 적용: python -m data_pipeline.bi_box_supabase_uploader --apply")
        return

    print("\n[5] Supabase INSERT 시작...")
    total = upload_to_supabase(records)
    print(f"\n완료: {total:,}행 INSERT")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
