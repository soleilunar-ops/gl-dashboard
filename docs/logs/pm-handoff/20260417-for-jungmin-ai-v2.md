# GL Project Supabase Integration — AI Agent Instructions

```yaml
document_type: ai_agent_instruction
version: 2.0
previous_version: 1.0 (2026-04-17 14:24 KST)
revision_reason: "v1 치명 문제 2개 + 경미 문제 3개 보완. 운영 DB에서 BEGIN/ROLLBACK 검증 완료."
project: gl-dashboard-dev
supabase_project_id: sbyglmzogaiwbwfjhrmo
supabase_region: ap-northeast-2
postgres_version: "17.6.1.104"
target_audience: coding_agent (Claude Code / Cursor / similar)
created_by: 김지호
created_at: 2026-04-17
revised_at: 2026-04-17 (v2)
related_docs:
  - 20260417-jungmin-feature-data-map.md (원본 정민 문서)
  - 20260417-for-jungmin-human.md (사람 읽기용)
  - 20260417-verification-report.md (v1 검증 결과)
priority: high
execution_order: strict
verification_status: "DDL 11/11 통과 · 데이터 커버리지 이슈 모두 반영"
```

---

## CONTEXT

You are a coding agent tasked with integrating the existing local-CSV-based forecasting pipeline with Supabase. The current pipeline has 3 critical gaps:

1. Model outputs (`forecast_round4.csv`, `model_b_*.csv`, `winter_analysis_*.csv`) are stored locally only, breaking server deployment
2. Bi-box marketplace data (`bi_box/*.csv`) has no Supabase equivalent
3. Some local CSVs duplicate data already in Supabase (`asos_weather_cache.csv`, regional trends, delivery rates)

Your objective: close these gaps by (A) creating 4 new tables, (B) replacing 5 local-CSV reads with Supabase queries, (C) adding UPSERT logic to model batch jobs.

**v2 KEY CHANGES FROM v1** (read before proceeding):

- `v_sales_weather` view recommendation WITHDRAWN (only joins Seoul ASOS; does not fit Model A's 5-station design)
- Weather strategy: HYBRID ASOS+ERA5 (neither alone covers all features: ASOS rain=0%, ERA5 wind_avg=0% for winter)
- Python snippets for `.select("x AS y")` alias and `.upsert(on_conflict=...)` REVISED (v1 used unsupported PostgREST syntax)
- Delivery rate column remapping CODE-LEVEL (v1 had comment-only)
- V4 verification updated to check both rain (ERA5) and wind_avg (ASOS) coverage

---

## EXISTING SUPABASE STATE (verified 2026-04-17)

### Tables available (15 total; forecast-relevant listed)

```yaml
daily_performance:
  rows: 12492
  columns:
    [
      id,
      sale_date,
      sku_id,
      vendor_item_id,
      vendor_item_name,
      gmv,
      units_sold,
      return_units,
      cogs,
      amv,
      asp,
      coupon_discount,
      coupang_extra_discount,
      instant_discount,
      promo_gmv,
      promo_units_sold,
      order_count,
      customer_count,
      avg_spend_per_customer,
      conversion_rate,
      page_views,
      sns_gmv,
      sns_cogs,
      sns_ratio,
      sns_units_sold,
      sns_return_units,
      review_count,
      avg_rating,
      created_at,
    ]
  date_range: [2025-04-01, 2026-04-11]
  unique_skus: 55
  fk: sku_id -> sku_master.sku_id

sku_master:
  rows: 59
  pk: sku_id
  columns:
    [
      sku_id,
      product_id,
      barcode,
      sku_name,
      brand,
      product_category,
      sub_category,
      detail_category,
      is_rocket_fresh,
      created_at,
      updated_at,
    ]
  category_distribution: { Home: 47, Beauty: 6, HPC: 5, CE: 1 }
  detail_category_home: { 보온소품: 42, 보냉소품: 2, 재난/방역용품: 2, 제설함/모래함: 1 }

weather_unified:
  rows: 27385
  columns:
    [
      id,
      weather_date,
      station,
      lat,
      lon,
      source,
      issued_date,
      forecast_day,
      temp_avg,
      temp_min,
      temp_max,
      apparent_temp_avg,
      apparent_temp_min,
      apparent_temp_max,
      precipitation,
      rain,
      snowfall,
      wind_avg,
      wind_max,
      wind_gust_max,
      wind_direction,
      humidity_avg,
      radiation,
      evapotranspiration,
      weather_code,
      created_at,
    ]
  stations: [서울, 수원, 부산, 대전, 광주] # Korean names, NOT KMA station IDs
  sources: [asos, era5, forecast]
  winter_coverage_2025_11_to_2026_03:
    asos:
      precipitation: "30-40% 커버리지 (월별 편차 큼)"
      rain: "0% (전부 NULL)"
      snowfall: "부분 커버"
    era5:
      precipitation: "100% 커버리지"
      rain: "100% 커버리지"
      snowfall: "100% 커버리지"

inventory_operation:
  rows: 5813
  date_range: [2026-01-01, 2026-04-11] # NO 2025 winter data
  unique_skus: 45
  fk: sku_id -> sku_master.sku_id

regional_sales:
  rows: 10374
  date_range_yyyymm: [202601, 202604] # ONLY 4 months
  unique_sido: 18

noncompliant_delivery:
  rows: 120
  week_range: [202515, 202615]

safety_stock_config:
  rows: 0 # empty, to be populated by Model A outputs
```

### Views — USE CAREFULLY

```yaml
v_weather_observed:
  definition: "weather_unified WHERE source='asos'"
  usage: "Temperature features only. DO NOT rely on rain/precipitation from this view for winter periods."
  safe_columns:
    [weather_date, station, temp_avg, temp_min, temp_max, humidity_avg, wind_avg, radiation]
  unsafe_columns_winter: [rain (0% coverage), precipitation (30% coverage), snowfall (부분)]

v_weather_forecast:
  definition: "weather_unified WHERE source='forecast'"
  usage: "Future forecast up to 15 days ahead"
  note: "Use with .eq('issued_date', today) to get today's forecast batch"

v_sales_weather:
  usage: "⚠️ DO NOT USE FOR MODEL A — this view joins ONLY Seoul ASOS station"
  reason: |
    Defined as: daily_performance JOIN weather_unified ON (station='서울' AND source='asos')
    Model A requires 5 stations + proper rain data. This view provides neither.
  alternative: "Hand-join daily_performance × sku_master × weather_unified (source='era5')"

v_stock_alert:
  usage: "Current-stock-below-reorder alerts. Only usable after safety_stock_config is populated."
```

---

## CRITICAL CONSTRAINTS (MUST READ BEFORE WRITING QUERIES)

### CONSTRAINT_1: weather_unified.station uses Korean names, not KMA IDs

```python
STATION_ID_TO_NAME = {
    "108": "서울",
    "119": "수원",
    "133": "대전",
    "156": "광주",
    "159": "부산",
}
STATION_NAME_TO_ID = {v: k for k, v in STATION_ID_TO_NAME.items()}
```

### CONSTRAINT_2: Weather features require ASOS+ERA5 HYBRID, not either alone

Verified coverage for 2025-11-01 to 2026-03-31 (755 rows per source):

| field            | asos      | era5      | forecast |
| ---------------- | --------- | --------- | -------- |
| temp_avg/min/max | ✅ 100%   | ✅ 100%   | ✅ 100%  |
| wind_avg         | ✅ 99%    | ❌ **0%** | ❌ 0%    |
| wind_max         | ✅ 99%    | ✅ 100%   | ✅ 100%  |
| rain             | ❌ **0%** | ✅ 100%   | ❌ 0%    |
| precipitation    | ⚠️ 30-40% | ✅ 100%   | ❌ 0%    |
| snowfall         | ⚠️ 부분   | ✅ 100%   | ❌ 0%    |

**Rule**: ASOS and ERA5 both have blind spots. Neither alone covers all Model A features. You MUST hybrid-join them.

- ASOS provides: `temp_avg`, `temp_min`, `temp_max`, `wind_avg` (observed)
- ERA5 provides: `rain`, `precipitation`, `snowfall` (reanalysis, 100% coverage)

**HYBRID SQL pattern (VERIFIED via EXPLAIN, Hash Join with index scans)**:

```sql
SELECT
  a.weather_date, a.station,
  a.temp_avg, a.temp_min, a.temp_max, a.wind_avg,  -- from ASOS
  e.rain, e.precipitation, e.snowfall               -- from ERA5
FROM weather_unified a
JOIN weather_unified e
  ON a.weather_date = e.weather_date
 AND a.station = e.station
WHERE a.source = 'asos' AND e.source = 'era5';
```

**Python pattern** (two queries + pandas merge, since PostgREST can't express self-join):

```python
def get_hybrid_weather(start_date, end_date) -> pd.DataFrame:
    asos = supabase.table("weather_unified") \
        .select("weather_date, station, temp_avg, temp_min, temp_max, wind_avg") \
        .eq("source", "asos") \
        .gte("weather_date", start_date.isoformat()) \
        .lte("weather_date", end_date.isoformat()) \
        .execute()
    asos_df = pd.DataFrame(asos.data)

    era5 = supabase.table("weather_unified") \
        .select("weather_date, station, rain, precipitation, snowfall") \
        .eq("source", "era5") \
        .gte("weather_date", start_date.isoformat()) \
        .lte("weather_date", end_date.isoformat()) \
        .execute()
    era5_df = pd.DataFrame(era5.data)

    merged = asos_df.merge(era5_df, on=["weather_date", "station"], how="inner")
    return merged
```

**Alternative**: Ask 지호 to create a view `v_weather_hybrid` that pre-joins these two sources. Then just query the view.

### CONSTRAINT_3: inventory_operation covers only 2026-01 to 2026-04

Cannot use for 2025 winter validation. Use `bi_box_daily` (new table) for historical winter stockout data.

### CONSTRAINT_4: regional_sales covers only 2026-01 to 2026-04

Cannot replace `regional_trend/*.csv` for synthetic_2024 generation. Keep local CSV.

### CONSTRAINT_5: PostgREST .select() does NOT support SQL aliases

```python
# WRONG — PostgREST will reject this silently or return malformed data
.select("date AS op_date, sku_id, is_stockout")

# CORRECT — select columns as-is, rename in pandas
.select("date, sku_id, is_stockout")
df = pd.DataFrame(response.data).rename(columns={"date": "op_date"})
```

### CONSTRAINT_6: supabase-py .upsert() signature varies by version

```python
# Check version first
# pip show supabase | grep Version

# supabase-py >= 2.0 pattern
supabase.table("forecast_model_a") \
    .upsert(records) \
    .execute()  # PK-based upsert is automatic

# If on_conflict param needed (some 2.x versions)
supabase.table("forecast_model_a") \
    .upsert(records, on_conflict="sku_id,week_start,model_version") \
    .execute()

# SAFEST FALLBACK: use RPC with raw SQL if upsert API fails
# Create a Postgres function first:
# CREATE OR REPLACE FUNCTION upsert_forecast_model_a(records jsonb) ...
```

---

## TASK 1 — Create 4 new tables

### TASK_1.1: bi_box_daily (VERIFIED via BEGIN/ROLLBACK)

```sql
CREATE TABLE bi_box_daily (
  date date NOT NULL,
  sku_id text NOT NULL,
  vendor_item_name text,
  price numeric,
  is_stockout boolean DEFAULT false,
  bi_box_share numeric,
  source_file text,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (date, sku_id),
  FOREIGN KEY (sku_id) REFERENCES sku_master(sku_id)
);

CREATE INDEX idx_bi_box_daily_date ON bi_box_daily(date);
CREATE INDEX idx_bi_box_daily_sku ON bi_box_daily(sku_id);

COMMENT ON TABLE bi_box_daily IS '바이박스 일별 가격/점유율/품절. 쿠팡 마켓 프론트 스크래핑. 2025 겨울 포함 5개월 커버.';

-- RLS enable
ALTER TABLE bi_box_daily ENABLE ROW LEVEL SECURITY;
```

### TASK_1.2: forecast_model_a (VERIFIED)

```sql
CREATE TABLE forecast_model_a (
  sku_id text NOT NULL,
  week_start date NOT NULL,
  model_version text NOT NULL DEFAULT 'round4',
  weekly_sales_qty_forecast numeric NOT NULL,
  lower_bound numeric,
  upper_bound numeric,
  confidence_interval numeric DEFAULT 0.95,
  features_used jsonb,
  generated_at timestamptz DEFAULT now(),
  PRIMARY KEY (sku_id, week_start, model_version),
  FOREIGN KEY (sku_id) REFERENCES sku_master(sku_id)
);

CREATE INDEX idx_fma_week ON forecast_model_a(week_start);
CREATE INDEX idx_fma_generated ON forecast_model_a(generated_at DESC);

COMMENT ON TABLE forecast_model_a IS 'Model A (LightGBM) 주간 SKU 판매 예측. model_version으로 배치 구분.';

ALTER TABLE forecast_model_a ENABLE ROW LEVEL SECURITY;
```

### TASK_1.3: forecast_model_b (VERIFIED — UNIQUE INDEX with COALESCE works)

```sql
-- Single table with nullable sku_id; NULL means category-level row
CREATE TABLE forecast_model_b (
  id bigserial PRIMARY KEY,
  week_start date NOT NULL,
  product_category text NOT NULL,
  sku_id text,  -- NULL for category-level row
  pred_ratio numeric,
  pred_linear numeric,
  distributed_qty numeric,  -- populated when sku_id is set
  model_version text NOT NULL DEFAULT 'v1',
  lookback_weeks integer DEFAULT 4,
  distribute_weeks integer DEFAULT 2,
  generated_at timestamptz DEFAULT now()
);

-- COALESCE trick: NULL sku_id dedup'd against '' sentinel (VERIFIED working)
CREATE UNIQUE INDEX idx_fmb_unique ON forecast_model_b(
  week_start, product_category, COALESCE(sku_id, ''), model_version
);
CREATE INDEX idx_fmb_week ON forecast_model_b(week_start);
CREATE INDEX idx_fmb_sku ON forecast_model_b(sku_id) WHERE sku_id IS NOT NULL;

ALTER TABLE forecast_model_b ADD CONSTRAINT fk_fmb_sku
  FOREIGN KEY (sku_id) REFERENCES sku_master(sku_id);

COMMENT ON TABLE forecast_model_b IS 'Model B 카테고리+SKU 발주 예측. sku_id=NULL은 카테고리 총량, 값 있으면 SKU 분배량.';

ALTER TABLE forecast_model_b ENABLE ROW LEVEL SECURITY;
```

### TASK_1.4: winter_validation (VERIFIED — CHECK constraint works)

```sql
CREATE TABLE winter_validation (
  id bigserial PRIMARY KEY,
  run_id text NOT NULL,
  grain text NOT NULL CHECK (grain IN ('weekly', 'sku', 'summary')),
  week_start date,     -- used when grain='weekly'
  sku_id text,         -- used when grain='sku'
  actual numeric,
  predicted numeric,
  abs_error numeric,
  error_pct numeric,
  bias numeric,
  overall_mae numeric, -- used when grain='summary'
  winter_mae numeric,  -- used when grain='summary'
  val_mae_no_synthetic numeric,
  notes text,
  generated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_wv_run ON winter_validation(run_id);
CREATE INDEX idx_wv_grain ON winter_validation(grain);
CREATE INDEX idx_wv_week ON winter_validation(week_start) WHERE grain = 'weekly';
CREATE INDEX idx_wv_sku ON winter_validation(sku_id) WHERE grain = 'sku';

ALTER TABLE winter_validation ADD CONSTRAINT fk_wv_sku
  FOREIGN KEY (sku_id) REFERENCES sku_master(sku_id);

COMMENT ON TABLE winter_validation IS '겨울 검증 결과. grain으로 주별/SKU별/요약 3 레벨 구분. run_id로 실행 구분.';

ALTER TABLE winter_validation ENABLE ROW LEVEL SECURITY;
```

---

## TASK 2 — Replace local CSV reads with Supabase queries

### TASK_2.1: Weather features for Model A (REVISED — HYBRID ASOS+ERA5)

**CHANGE FROM v1**: Withdrew `v_sales_weather` view. Use two-query + pandas merge pattern.
**CHANGE FROM v2 initial draft**: Must hybrid ASOS+ERA5 (neither alone covers all features).

```python
# services/api/analytics/weekly_demand_forecast.py

STATION_ID_TO_NAME = {
    "108": "서울", "119": "수원", "133": "대전",
    "156": "광주", "159": "부산"
}

def get_weather_features(start_date, end_date) -> pd.DataFrame:
    """
    Hybrid ASOS+ERA5. See CONSTRAINT_2 for rationale.
    ASOS: temp fields + wind_avg (observed, actual weather)
    ERA5: rain, precipitation, snowfall (reanalysis, 100% coverage)
    """
    # ASOS for temperature + wind
    asos = supabase.table("weather_unified") \
        .select("weather_date, station, temp_avg, temp_min, temp_max, wind_avg") \
        .eq("source", "asos") \
        .gte("weather_date", start_date.isoformat()) \
        .lte("weather_date", end_date.isoformat()) \
        .execute()
    asos_df = pd.DataFrame(asos.data)

    # ERA5 for precipitation + snow
    era5 = supabase.table("weather_unified") \
        .select("weather_date, station, rain, precipitation, snowfall") \
        .eq("source", "era5") \
        .gte("weather_date", start_date.isoformat()) \
        .lte("weather_date", end_date.isoformat()) \
        .execute()
    era5_df = pd.DataFrame(era5.data)

    # Merge on date + station
    df = asos_df.merge(era5_df, on=["weather_date", "station"], how="inner")

    # CONSTRAINT_1: map station Korean names back to KMA IDs
    df["station_id"] = df["station"].map({v: k for k, v in STATION_ID_TO_NAME.items()})

    # Rename to match local CSV column format
    df = df.rename(columns={
        "weather_date": "date",
        "temp_avg": "temp_mean",
        "wind_avg": "wind_mean",
        "rain": "rain_mm",
        "snowfall": "snow_cm",
    })

    return df[["date", "station_id", "temp_mean", "temp_min", "temp_max",
               "rain_mm", "snow_cm", "wind_mean"]]


def get_sales_weather_joined(start_date, end_date, weighting: str = "seoul_dominant"):
    """
    Hand-join daily_performance × sku_master × hybrid weather.
    Replaces v_sales_weather (Seoul ASOS only + no rain data).

    weighting options (decision_5):
      - 'simple_mean': 5-station unweighted mean
      - 'seoul_dominant': Seoul-weighted (matches synthetic_2024 logic: 수도권 61.5%)
      - 'capital_regional_60': 수도권(서울+수원) 60% / 기타 10% each
    """
    sales = supabase.table("daily_performance") \
        .select("*") \
        .gte("sale_date", start_date.isoformat()) \
        .lte("sale_date", end_date.isoformat()) \
        .execute()
    sales_df = pd.DataFrame(sales.data)

    weather = get_weather_features(start_date, end_date)

    if weighting == "simple_mean":
        weather_agg = weather.groupby("date").agg({
            "temp_mean": "mean", "temp_min": "min", "temp_max": "max",
            "rain_mm": "mean", "snow_cm": "mean", "wind_mean": "mean",
        }).reset_index()
    elif weighting == "seoul_dominant":
        # 서울 61.5%, 나머지 4개소 합쳐서 38.5% (각 9.625%)
        weights = {"서울": 0.615, "수원": 0.0963, "부산": 0.0963, "대전": 0.0963, "광주": 0.0961}
        weather["w"] = weather["station"].map(weights)
        weather_agg = weather.groupby("date").apply(
            lambda g: pd.Series({
                col: (g[col] * g["w"]).sum() / g["w"].sum()
                for col in ["temp_mean", "temp_min", "temp_max", "rain_mm", "snow_cm", "wind_mean"]
            })
        ).reset_index()
    elif weighting == "capital_regional_60":
        weights = {"서울": 0.30, "수원": 0.30, "부산": 0.1334, "대전": 0.1333, "광주": 0.1333}
        weather["w"] = weather["station"].map(weights)
        weather_agg = weather.groupby("date").apply(
            lambda g: pd.Series({
                col: (g[col] * g["w"]).sum() / g["w"].sum()
                for col in ["temp_mean", "temp_min", "temp_max", "rain_mm", "snow_cm", "wind_mean"]
            })
        ).reset_index()
    else:
        raise ValueError(f"Unknown weighting: {weighting}")

    merged = sales_df.merge(weather_agg, left_on="sale_date", right_on="date", how="left")
    return merged
```

### TASK_2.2: Open-Meteo forecast replacement (UNCHANGED)

```python
# services/api/data_pipeline/open_meteo_ecmwf.py

def get_forecast_from_supabase(today: date, horizon_days: int = 15):
    end = today + timedelta(days=horizon_days)

    response = supabase.table("weather_unified") \
        .select("*") \
        .eq("source", "forecast") \
        .gte("weather_date", today.isoformat()) \
        .lte("weather_date", end.isoformat()) \
        .eq("issued_date", today.isoformat()) \
        .execute()

    return pd.DataFrame(response.data)
```

### TASK_2.3: Delivery rate replacement (REVISED — rename code added)

```python
# services/api/analytics/order_response_model.py

def get_delivery_data(start_week: str = "202515"):
    response = supabase.table("noncompliant_delivery") \
        .select("*") \
        .gte("year_week", start_week) \
        .execute()

    df = pd.DataFrame(response.data)

    # Rename to match existing Excel-based code (if needed)
    df = df.rename(columns={
        "year_week": "Week of Delivery",
        "units_requested": "Units Requested",
        "units_confirmed": "Units Confirmed",
        "units_received": "Units Received",
        "product_category": "Product Category",
        "sub_category": "Sub Category",
        "total_noncompliance": "Total Noncompliance Units",
    })
    return df
```

### TASK_2.4: Bi-box stockout hybrid (REVISED — PostgREST alias removed)

```python
from datetime import date

def get_stockout_data(start_date: date, end_date: date) -> pd.DataFrame:
    """
    Hybrid strategy:
    - >= 2026-01-01: use inventory_operation (all 2026+ covered)
    - < 2026-01-01: use bi_box_daily (2025 winter data)
    """
    if start_date >= date(2026, 1, 1):
        response = supabase.table("inventory_operation") \
            .select("op_date, sku_id, is_stockout") \
            .gte("op_date", start_date.isoformat()) \
            .lte("op_date", end_date.isoformat()) \
            .execute()
        return pd.DataFrame(response.data)
    else:
        # CONSTRAINT_5: no AS alias in .select()
        response = supabase.table("bi_box_daily") \
            .select("date, sku_id, is_stockout") \
            .gte("date", start_date.isoformat()) \
            .lte("date", end_date.isoformat()) \
            .execute()
        df = pd.DataFrame(response.data).rename(columns={"date": "op_date"})
        return df
```

### TASK_2.5: DO NOT replace — keep these local

```yaml
- data/raw/coupang/regional_trend/*.csv:
    reason: "regional_sales covers only 2026-01 to 2026-04 (4 months); synthetic_2024 needs historical weights"
    action: KEEP LOCAL

- data/processed/synthetic_2024_*.csv:
    reason: "training-only data, not read by dashboard API"
    action: KEEP LOCAL (consider Git LFS)
```

---

## TASK 3 — Add UPSERT logic to model batch jobs

### TASK_3.1: Model A output UPSERT (REVISED — version check)

```python
# services/api/analytics/weekly_demand_forecast.py

def save_forecast_to_supabase(forecast_df: pd.DataFrame, model_version: str = "round4"):
    """
    Upsert Model A results. Requires supabase-py >= 2.0.
    """
    records = []
    for _, row in forecast_df.iterrows():
        records.append({
            "sku_id": str(row["sku"]),
            "week_start": row["week_start"].isoformat() if hasattr(row["week_start"], 'isoformat') else str(row["week_start"]),
            "model_version": model_version,
            "weekly_sales_qty_forecast": float(row["weekly_sales_qty_forecast"]),
            "lower_bound": float(row["lower_bound"]) if "lower_bound" in row and pd.notna(row["lower_bound"]) else None,
            "upper_bound": float(row["upper_bound"]) if "upper_bound" in row and pd.notna(row["upper_bound"]) else None,
        })

    # CONSTRAINT_6: try upsert, fallback to raw SQL if version mismatch
    try:
        supabase.table("forecast_model_a") \
            .upsert(records, on_conflict="sku_id,week_start,model_version") \
            .execute()
    except TypeError:
        # Older supabase-py: upsert without on_conflict arg
        supabase.table("forecast_model_a").upsert(records).execute()

    # Log to data_sync_log
    supabase.table("data_sync_log").insert({
        "table_name": "forecast_model_a",
        "source_file": f"model_a_batch_{model_version}",
        "rows_inserted": len(records),
        "status": "success"
    }).execute()
```

### TASK_3.2: Model B output UPSERT (DELETE+INSERT pattern, VERIFIED)

```python
def save_model_b_to_supabase(
    category_df: pd.DataFrame,
    sku_df: pd.DataFrame,
    model_version: str = "v1"
):
    # Build records
    category_records = [
        {
            "week_start": row["week_start"].isoformat() if hasattr(row["week_start"], 'isoformat') else str(row["week_start"]),
            "product_category": str(row["category"]),
            "sku_id": None,
            "pred_ratio": float(row["pred_ratio"]),
            "pred_linear": float(row["pred_linear"]),
            "model_version": model_version,
        }
        for _, row in category_df.iterrows()
    ]

    sku_records = [
        {
            "week_start": row["week_start"].isoformat() if hasattr(row["week_start"], 'isoformat') else str(row["week_start"]),
            "product_category": str(row["category"]),
            "sku_id": str(row["sku"]),
            "distributed_qty": float(row["distributed_qty"]),
            "model_version": model_version,
        }
        for _, row in sku_df.iterrows()
    ]

    # Delete old rows for same week_range + model_version (handles NULL sku_id too via IN)
    week_starts = sorted(set(r["week_start"] for r in category_records + sku_records))
    supabase.table("forecast_model_b") \
        .delete() \
        .eq("model_version", model_version) \
        .in_("week_start", week_starts) \
        .execute()

    # Insert fresh
    supabase.table("forecast_model_b").insert(category_records + sku_records).execute()
```

### TASK_3.3: Winter validation UPSERT (VERIFIED)

```python
from datetime import datetime

def save_winter_validation(
    weekly_df: pd.DataFrame,
    sku_df: pd.DataFrame,
    summary: dict,
    run_id: str = None
):
    if run_id is None:
        run_id = f"run_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

    records = []

    # Weekly grain
    for _, row in weekly_df.iterrows():
        records.append({
            "run_id": run_id,
            "grain": "weekly",
            "week_start": row["week_start"].isoformat() if hasattr(row["week_start"], 'isoformat') else str(row["week_start"]),
            "actual": float(row["actual"]),
            "predicted": float(row["predicted"]),
            "abs_error": float(row["abs_error"]),
            "error_pct": float(row["error_pct"]) if pd.notna(row.get("error_pct")) else None,
            "bias": float(row["bias"]) if pd.notna(row.get("bias")) else None,
        })

    # SKU grain
    for _, row in sku_df.iterrows():
        records.append({
            "run_id": run_id,
            "grain": "sku",
            "sku_id": str(row["sku"]),
            "actual": float(row["actual"]),
            "predicted": float(row["predicted"]),
            "abs_error": float(row["abs_error"]),
        })

    # Summary grain
    records.append({
        "run_id": run_id,
        "grain": "summary",
        "overall_mae": summary.get("overall_mae"),
        "winter_mae": summary.get("winter_mae"),
        "val_mae_no_synthetic": summary.get("val_mae_no_synthetic"),
        "notes": summary.get("notes", ""),
    })

    supabase.table("winter_validation").insert(records).execute()
    return run_id
```

---

## TASK 4 — Update FastAPI endpoints

### TASK_4.1: /forecast/weekly-prediction

```python
@router.get("/weekly-prediction")
async def weekly_prediction(
    weeks_ahead: int = 4,
    model_version: str = "round4"
):
    start = datetime.now().date()
    end = start + timedelta(weeks=weeks_ahead)

    response = supabase.table("forecast_model_a") \
        .select("*") \
        .eq("model_version", model_version) \
        .gte("week_start", start.isoformat()) \
        .lte("week_start", end.isoformat()) \
        .order("week_start") \
        .order("sku_id") \
        .execute()

    return {"forecasts": response.data}
```

### TASK_4.2: /forecast/insight

```python
@router.get("/insight")
async def insight():
    # Top-5 SKU forecasts (Model A)
    model_a = supabase.table("forecast_model_a") \
        .select("*") \
        .order("weekly_sales_qty_forecast", desc=True) \
        .limit(5) \
        .execute()

    # Category forecasts (Model B category rows — sku_id IS NULL)
    model_b = supabase.table("forecast_model_b") \
        .select("*") \
        .is_("sku_id", "null") \
        .order("generated_at", desc=True) \
        .limit(4) \
        .execute()

    # Latest winter validation summary
    validation = supabase.table("winter_validation") \
        .select("val_mae_no_synthetic, winter_mae, overall_mae") \
        .eq("grain", "summary") \
        .order("generated_at", desc=True) \
        .limit(1) \
        .execute()

    # Weather context (last 7 days ERA5)
    end = datetime.now().date()
    start = end - timedelta(days=7)
    weather = supabase.table("weather_unified") \
        .select("weather_date, station, temp_avg, temp_min, rain") \
        .eq("source", "era5") \
        .gte("weather_date", start.isoformat()) \
        .lte("weather_date", end.isoformat()) \
        .execute()

    # Call OpenAI with assembled context
    # ... (existing GPT-4o-mini call logic)
```

### TASK_4.3: /forecast/winter-analysis

```python
@router.get("/winter-analysis")
async def winter_analysis(run_id: str = None):
    query = supabase.table("winter_validation") \
        .select("*") \
        .eq("grain", "weekly")

    if run_id:
        query = query.eq("run_id", run_id)
    else:
        # Get latest run
        latest = supabase.table("winter_validation") \
            .select("run_id") \
            .eq("grain", "summary") \
            .order("generated_at", desc=True) \
            .limit(1) \
            .execute()
        if latest.data:
            query = query.eq("run_id", latest.data[0]["run_id"])

    response = query.order("week_start").execute()
    return {"weekly": response.data}
```

### TASK_4.4: /forecast/order-simulation

```python
@router.get("/order-simulation")
async def order_simulation(model_version: str = "v1"):
    response = supabase.table("forecast_model_b") \
        .select("*") \
        .not_.is_("sku_id", "null") \
        .eq("model_version", model_version) \
        .order("week_start") \
        .order("sku_id") \
        .execute()
    return {"sku_distribution": response.data}
```

---

## VERIFICATION CHECKLIST

Run these after all tasks complete:

```sql
-- V1: All 4 new tables exist with correct columns
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name IN ('bi_box_daily', 'forecast_model_a', 'forecast_model_b', 'winter_validation')
ORDER BY table_name, ordinal_position;

-- V2: Data populated
SELECT 'bi_box_daily' AS t, COUNT(*) FROM bi_box_daily UNION ALL
SELECT 'forecast_model_a', COUNT(*) FROM forecast_model_a UNION ALL
SELECT 'forecast_model_b', COUNT(*) FROM forecast_model_b UNION ALL
SELECT 'winter_validation', COUNT(*) FROM winter_validation;

-- V3: FK integrity
SELECT 'forecast_model_a' AS t, COUNT(*) AS orphans
FROM forecast_model_a f
LEFT JOIN sku_master s ON f.sku_id = s.sku_id
WHERE s.sku_id IS NULL
UNION ALL
SELECT 'forecast_model_b', COUNT(*)
FROM forecast_model_b f
LEFT JOIN sku_master s ON f.sku_id = s.sku_id
WHERE f.sku_id IS NOT NULL AND s.sku_id IS NULL;
-- Expected: both rows = 0

-- V4: Winter weather check (CONSTRAINT_2 validation)
SELECT
  source,
  COUNT(*) AS total,
  COUNT(rain) AS rain_coverage,
  COUNT(wind_avg) AS wind_coverage,
  COUNT(snowfall) AS snow_coverage
FROM weather_unified
WHERE weather_date BETWEEN '2025-11-01' AND '2026-03-31'
GROUP BY source;
-- Expected:
--   asos: rain=0, wind_avg≈total, snow=partial
--   era5: rain≈total, wind_avg=0, snow≈total
-- Conclusion: must hybrid both sources

-- V5: data_sync_log records batches
SELECT table_name, COUNT(*), MAX(synced_at)
FROM data_sync_log
GROUP BY table_name;
-- Expected: rows for each new table after first batch run
```

---

## OPEN DECISIONS (AWAITING 정민 INPUT)

```yaml
decision_1_weather_source:
  question: "ASOS+ERA5 하이브리드 외 다른 전략 원하는가?"
  recommendation: "하이브리드 유지 (ASOS temp+wind, ERA5 rain+snow)"
  rationale: |
    2025-11 ~ 2026-03 실측:
    - ASOS rain: 0%, wind_avg: 99%
    - ERA5 rain: 100%, wind_avg: 0%
    - 둘 중 하나만 쓰면 feature 손실 필연
  alternatives_if_hybrid_too_complex:
    - "단순화: 지호에게 v_weather_hybrid 뷰 제작 요청"
  blocks: TASK_2.1

decision_2_bi_box_upload_frequency:
  question: "바이박스 데이터 업로드 주기?"
  options:
    - A: "1회성 과거 5개월치만"
    - B: "매일 신규 수집"
    - C: "주 단위 배치"
  blocks: TASK_1.1 data population

decision_3_model_version_policy:
  question: "model_version 컬럼 유지 vs 테이블당 단일 모델?"
  recommendation: "유지 (A/B 실험 편리)"
  default: A
  impact: TASK_1.2, TASK_1.3, TASK_3.1, TASK_3.2

decision_4_synthetic_data:
  recommendation: "KEEP LOCAL (학습 전용, 대시보드 미사용)"
  default: skip

decision_5_regional_weighting:
  question: "TASK_2.1에서 5개 관측소 단순 평균 vs 지역별 판매 비중 가중 평균?"
  options:
    - A: "단순 평균 (가장 단순, regional_trend CSV 불필요)"
    - B: "수도권 61.5% 고정 가중 (정민 기존 synthetic 로직과 동일)"
    - C: "regional_sales 테이블 기반 동적 가중 (단, 2026-01부터만 가능)"
  recommendation: B
  blocks: TASK_2.1 weather aggregation logic
```

---

## EXECUTION ORDER

```
1. Confirm open decisions (1-5) with 정민
2. Apply TASK_1 migrations in order: 1.1 → 1.2 → 1.3 → 1.4
3. Run V1 (schema check)
4. Populate bi_box_daily from existing CSV (if decision_2 = A or B)
5. Execute TASK_2 code changes (read-side)
6. Test Model A locally reading from Supabase (no UPSERT yet)
7. Execute TASK_3 code changes (write-side / UPSERT)
8. Run Model A + Model B + Winter validation batches once
9. Run V2, V3 (data + integrity check)
10. Execute TASK_4 (API endpoints)
11. Run V4 (weather coverage), V5 (sync log)
12. End-to-end test dashboard
```

---

## ERROR HANDLING GUIDELINES

```yaml
on_duplicate_pk:
  action: UPSERT (PK auto-conflict resolution)

on_fk_violation:
  action: LOG + SKIP row
  alert_threshold: "if > 1% of batch, raise"
  reason: "sku_master drift; investigate separately"

on_null_required:
  action: RAISE; do not silently default

on_batch_failure:
  action: INSERT data_sync_log with status='failed'
  rollback: "DELETE rows with run_id or generated_at matching failed batch"

on_postgrest_alias_error:
  symptom: "select returns weird column names or empty"
  fix: "check CONSTRAINT_5; use pandas rename after fetch"

on_upsert_signature_error:
  symptom: "TypeError: upsert() got unexpected keyword argument 'on_conflict'"
  fix: "check CONSTRAINT_6; try without on_conflict arg first"

on_winter_rain_or_wind_nulls:
  symptom: "Model A features have all-NULL rain_mm or wind_mean for winter months"
  fix: |
    check CONSTRAINT_2; neither ASOS nor ERA5 alone covers both.
    Use hybrid pattern from TASK_2.1: ASOS for temp+wind, ERA5 for rain+snow.
```

---

## REFERENCE: Supabase client setup

```python
# requirements.txt
# supabase>=2.0.0

import os
from supabase import create_client, Client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# Verify version at startup
import supabase as sb_module
print(f"supabase-py version: {sb_module.__version__}")
# If < 2.0, upgrade: pip install --upgrade 'supabase>=2.0'
```

---

## CHANGELOG

```yaml
v2.0 (2026-04-17 revised):
  critical_fixes:
    - "CONSTRAINT_2 추가: 겨울 구간 weather 피처 커버리지 실측 반영"
    - "weather 전략: ASOS+ERA5 HYBRID로 결정 (ASOS rain=0%, ERA5 wind=0%)"
    - "v_sales_weather 뷰 추천 철회 (서울 ASOS only)"
    - "TASK_2.1 하이브리드 2-query + pandas merge 패턴으로 재작성"
    - "decision_5 지역 가중 3가지 옵션 코드로 구현 (simple_mean / seoul_dominant / capital_regional_60)"
  minor_fixes:
    - "CONSTRAINT_5 추가: PostgREST .select() AS alias 불가"
    - "CONSTRAINT_6 추가: supabase-py upsert 버전 호환"
    - "TASK_2.3 delivery 컬럼 rename 실코드 추가 (v1은 주석만)"
    - "TASK_2.4 PostgREST alias 제거"
    - "TASK_3.1 upsert try/except 폴백 추가"
  enhancements:
    - "TASK_4.4 order-simulation 엔드포인트 추가"
    - "ERROR HANDLING에 포스트REST/upsert/weather 이슈별 대응 추가"
    - "V4 검증 쿼리를 wind_avg + snowfall 커버리지까지 확장"
```

END OF INSTRUCTIONS v2.0
