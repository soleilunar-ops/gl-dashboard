
-- ============================================================
-- GL 프로젝트 Baseline Schema v1
-- 이 마이그레이션은 기존 히스토리를 리셋한 후의 기준점.
-- 모든 테이블/뷰/트리거가 이미 존재하므로 IF NOT EXISTS 사용.
-- ============================================================

-- 1) SKU 마스터
CREATE TABLE IF NOT EXISTS sku_master (
    sku_id TEXT PRIMARY KEY, product_id TEXT, barcode TEXT,
    sku_name TEXT NOT NULL, brand TEXT, product_category TEXT,
    sub_category TEXT, detail_category TEXT,
    is_rocket_fresh BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sku_brand ON sku_master(brand);
CREATE INDEX IF NOT EXISTS idx_sku_category ON sku_master(product_category, sub_category);

-- 2) 일별 판매 실적
CREATE TABLE IF NOT EXISTS daily_performance (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    sale_date DATE NOT NULL, sku_id TEXT NOT NULL REFERENCES sku_master(sku_id),
    vendor_item_id TEXT NOT NULL, vendor_item_name TEXT,
    gmv NUMERIC DEFAULT 0, units_sold INTEGER DEFAULT 0, return_units INTEGER DEFAULT 0,
    cogs NUMERIC DEFAULT 0, amv NUMERIC DEFAULT 0, asp NUMERIC DEFAULT 0,
    coupon_discount NUMERIC DEFAULT 0, coupang_extra_discount NUMERIC DEFAULT 0,
    instant_discount NUMERIC DEFAULT 0, promo_gmv NUMERIC DEFAULT 0,
    promo_units_sold INTEGER DEFAULT 0, order_count INTEGER DEFAULT 0,
    customer_count INTEGER DEFAULT 0, avg_spend_per_customer NUMERIC DEFAULT 0,
    conversion_rate NUMERIC DEFAULT 0, page_views INTEGER DEFAULT 0,
    sns_gmv NUMERIC DEFAULT 0, sns_cogs NUMERIC DEFAULT 0, sns_ratio NUMERIC DEFAULT 0,
    sns_units_sold INTEGER DEFAULT 0, sns_return_units INTEGER DEFAULT 0,
    review_count INTEGER DEFAULT 0, avg_rating NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_daily_perf UNIQUE (sale_date, sku_id, vendor_item_id)
);
CREATE INDEX IF NOT EXISTS idx_dp_date ON daily_performance(sale_date);
CREATE INDEX IF NOT EXISTS idx_dp_sku_date ON daily_performance(sku_id, sale_date);

-- 3) 재고/발주 운영
CREATE TABLE IF NOT EXISTS inventory_operation (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    op_date DATE NOT NULL, sku_id TEXT NOT NULL REFERENCES sku_master(sku_id),
    center TEXT, order_status TEXT, order_status_detail TEXT,
    inbound_qty INTEGER DEFAULT 0, outbound_qty INTEGER DEFAULT 0,
    current_stock INTEGER DEFAULT 0, purchase_cost NUMERIC DEFAULT 0,
    order_fulfillment_rate NUMERIC DEFAULT 0, confirmed_fulfillment_rate NUMERIC DEFAULT 0,
    return_rate NUMERIC DEFAULT 0, return_reason TEXT,
    is_stockout BOOLEAN DEFAULT FALSE, category_stockout_rate NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_inv_op UNIQUE (op_date, sku_id)
);
CREATE INDEX IF NOT EXISTS idx_inv_date ON inventory_operation(op_date);
CREATE INDEX IF NOT EXISTS idx_inv_sku_date ON inventory_operation(sku_id, op_date);
CREATE INDEX IF NOT EXISTS idx_inv_stock ON inventory_operation(current_stock);

-- 4) 지역별 월 매출
CREATE TABLE IF NOT EXISTS regional_sales (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    year_month TEXT NOT NULL, product_category TEXT, sub_category TEXT,
    detail_category TEXT, brand TEXT, sido TEXT NOT NULL, sigungu TEXT NOT NULL,
    gmv NUMERIC DEFAULT 0, units_sold INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_regional UNIQUE (year_month, product_category, sub_category, detail_category, brand, sido, sigungu)
);
CREATE INDEX IF NOT EXISTS idx_rs_month ON regional_sales(year_month);
CREATE INDEX IF NOT EXISTS idx_rs_region ON regional_sales(sido, sigungu);
CREATE INDEX IF NOT EXISTS idx_rs_brand ON regional_sales(brand);

-- 5) 납품 미준수
CREATE TABLE IF NOT EXISTS noncompliant_delivery (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    year_week TEXT NOT NULL, vendor_id TEXT NOT NULL,
    product_category TEXT NOT NULL, sub_category TEXT,
    units_requested INTEGER DEFAULT 0, units_confirmed INTEGER DEFAULT 0,
    units_received INTEGER DEFAULT 0, total_noncompliance INTEGER DEFAULT 0,
    barcode_error INTEGER DEFAULT 0, expiry_error INTEGER DEFAULT 0,
    damaged INTEGER DEFAULT 0, under_delivery INTEGER DEFAULT 0,
    over_delivery INTEGER DEFAULT 0, wrong_packaging INTEGER DEFAULT 0,
    wrong_fc INTEGER DEFAULT 0, wrong_item INTEGER DEFAULT 0,
    invalid_info INTEGER DEFAULT 0, statement_missing INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_noncompliant UNIQUE (year_week, vendor_id, product_category, sub_category)
);
CREATE INDEX IF NOT EXISTS idx_nc_week ON noncompliant_delivery(year_week);

-- 6) 통합 기상
CREATE TABLE IF NOT EXISTS weather_unified (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    weather_date DATE NOT NULL, station TEXT NOT NULL,
    lat NUMERIC, lon NUMERIC, source TEXT NOT NULL,
    issued_date DATE, forecast_day INTEGER,
    temp_avg NUMERIC, temp_min NUMERIC, temp_max NUMERIC,
    apparent_temp_avg NUMERIC, apparent_temp_min NUMERIC, apparent_temp_max NUMERIC,
    precipitation NUMERIC, rain NUMERIC, snowfall NUMERIC,
    wind_avg NUMERIC, wind_max NUMERIC, wind_gust_max NUMERIC,
    wind_direction NUMERIC, humidity_avg NUMERIC, radiation NUMERIC,
    evapotranspiration NUMERIC, weather_code TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_weather UNIQUE (weather_date, station, source, issued_date)
);
CREATE INDEX IF NOT EXISTS idx_weather_date ON weather_unified(weather_date);
CREATE INDEX IF NOT EXISTS idx_weather_station_date ON weather_unified(station, weather_date);
CREATE INDEX IF NOT EXISTS idx_weather_source ON weather_unified(source);

-- 7) 안전재고 + 동기화 로그
CREATE TABLE IF NOT EXISTS safety_stock_config (
    sku_id TEXT PRIMARY KEY REFERENCES sku_master(sku_id),
    safety_stock_qty INTEGER NOT NULL, reorder_point INTEGER,
    lead_time_days INTEGER DEFAULT 14, calculation_method TEXT DEFAULT 'manual',
    last_calculated_at TIMESTAMPTZ, notes TEXT, updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS data_sync_log (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    table_name TEXT NOT NULL, source_file TEXT,
    max_date_before DATE, max_date_after DATE,
    rows_inserted INTEGER DEFAULT 0, rows_updated INTEGER DEFAULT 0,
    rows_skipped INTEGER DEFAULT 0, synced_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'success', error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_sync_table ON data_sync_log(table_name, synced_at DESC);

-- 8) 뷰
CREATE OR REPLACE VIEW v_sales_weather AS
SELECT dp.sale_date, dp.sku_id, sm.sku_name, sm.brand, sm.detail_category,
    dp.vendor_item_id, dp.vendor_item_name,
    dp.gmv, dp.units_sold, dp.return_units, dp.cogs, dp.promo_gmv,
    dp.coupon_discount + dp.coupang_extra_discount + dp.instant_discount AS total_discount,
    dp.conversion_rate, dp.page_views,
    w.temp_avg, w.temp_min, w.temp_max, w.precipitation, w.humidity_avg, w.wind_avg, w.radiation, w.snowfall
FROM daily_performance dp
JOIN sku_master sm ON dp.sku_id = sm.sku_id
LEFT JOIN weather_unified w ON dp.sale_date = w.weather_date AND w.station = '서울' AND w.source = 'asos';

CREATE OR REPLACE VIEW v_weather_observed AS
SELECT weather_date, station, temp_avg, temp_min, temp_max,
    precipitation, rain, snowfall, wind_avg, humidity_avg, radiation
FROM weather_unified WHERE source = 'asos';

CREATE OR REPLACE VIEW v_weather_forecast AS
SELECT weather_date, station, issued_date, forecast_day,
    temp_avg, temp_min, temp_max, apparent_temp_avg, apparent_temp_min, apparent_temp_max,
    precipitation, rain, snowfall, wind_avg, humidity_avg, weather_code
FROM weather_unified WHERE source = 'forecast';

CREATE OR REPLACE VIEW v_stock_alert AS
SELECT io.op_date, io.sku_id, sm.sku_name, sm.brand,
    io.current_stock, sc.safety_stock_qty, sc.reorder_point, sc.lead_time_days,
    io.current_stock - sc.safety_stock_qty AS stock_gap, io.order_status, io.is_stockout
FROM inventory_operation io
JOIN sku_master sm ON io.sku_id = sm.sku_id
JOIN safety_stock_config sc ON io.sku_id = sc.sku_id
WHERE io.op_date = (SELECT MAX(op_date) FROM inventory_operation)
  AND io.current_stock <= sc.reorder_point;

CREATE OR REPLACE VIEW v_promo_roi AS
SELECT sale_date, sku_id, vendor_item_id, gmv, promo_gmv,
    coupon_discount + coupang_extra_discount + instant_discount AS total_discount,
    CASE WHEN (coupon_discount + coupang_extra_discount + instant_discount) > 0
        THEN promo_gmv / (coupon_discount + coupang_extra_discount + instant_discount) END AS promo_roi,
    promo_units_sold, units_sold
FROM daily_performance
WHERE promo_gmv > 0 OR coupon_discount > 0 OR coupang_extra_discount > 0 OR instant_discount > 0;

CREATE OR REPLACE VIEW v_data_status AS
SELECT 'daily_performance' AS table_name, MIN(sale_date) AS earliest_date, MAX(sale_date) AS latest_date, COUNT(*) AS total_rows, COUNT(DISTINCT sku_id) AS unique_skus FROM daily_performance
UNION ALL SELECT 'inventory_operation', MIN(op_date), MAX(op_date), COUNT(*), COUNT(DISTINCT sku_id) FROM inventory_operation
UNION ALL SELECT 'regional_sales', TO_DATE(MIN(year_month)||'01','YYYYMMDD'), TO_DATE(MAX(year_month)||'01','YYYYMMDD'), COUNT(*), NULL::INTEGER FROM regional_sales
UNION ALL SELECT 'noncompliant_delivery', NULL, NULL, COUNT(*), NULL::INTEGER FROM noncompliant_delivery
UNION ALL SELECT 'weather_unified ('||source||')', MIN(weather_date), MAX(weather_date), COUNT(*), COUNT(DISTINCT station)::INTEGER FROM weather_unified GROUP BY source;

-- 9) 트리거
CREATE OR REPLACE FUNCTION notify_stock_alert() RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM safety_stock_config sc WHERE sc.sku_id = NEW.sku_id AND NEW.current_stock <= sc.reorder_point) THEN
        PERFORM pg_notify('stock_alert', json_build_object('sku_id', NEW.sku_id, 'current_stock', NEW.current_stock, 'op_date', NEW.op_date)::text);
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stock_alert ON inventory_operation;
CREATE TRIGGER trg_stock_alert AFTER INSERT OR UPDATE ON inventory_operation FOR EACH ROW EXECUTE FUNCTION notify_stock_alert();
