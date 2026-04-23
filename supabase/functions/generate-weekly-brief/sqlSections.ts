// 06 v0.3 — 주간 리포트 파트별 SQL. 기존 뷰 최대 재사용.
// 실제 스키마 반영. 공식 톤 LLM이 이 rows를 한국어 서술로 전개.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export interface SectionResult {
  rows: unknown[];
  query: string;
}

async function runSafe(sb: SupabaseClient, sql: string): Promise<unknown[]> {
  const { data, error } = await sb.rpc("safe_run_sql", { p_query: sql });
  if (error) throw new Error(`safe_run_sql: ${error.message}\n---\n${sql}`);
  return (data ?? []) as unknown[];
}

/** § 1 주문 — ERP 축 (법인별: erp_system 기준) */
export async function sqlOrdersSection(
  sb: SupabaseClient,
  ws: string,
  we: string
): Promise<SectionResult> {
  const q = `
    with week_range as (select '${ws}'::date as ws, '${we}'::date as we),
    approved as (
      select erp_system,
             sum(total_amount) as revenue,
             count(*) as cnt
      from orders, week_range w
      where tx_type = 'sale'
        and status = 'approved'
        and is_internal = false
        and tx_date between w.ws and w.we
      group by erp_system
    ),
    prev_week as (
      select erp_system, sum(total_amount) as revenue_prev
      from orders
      where tx_type = 'sale'
        and status = 'approved'
        and is_internal = false
        and tx_date between '${ws}'::date - 7 and '${ws}'::date - 1
      group by erp_system
    ),
    pending as (
      select erp_system,
             count(*) as pending_cnt,
             max((current_date - tx_date)) as max_wait_days
      from orders
      where status = 'pending' and is_internal = false
      group by erp_system
    ),
    rejected_reasons as (
      select rejected_reason, count(*) as cnt
      from orders, week_range w
      where status = 'rejected'
        and tx_date between w.ws and w.we
      group by rejected_reason
      order by cnt desc
      limit 3
    )
    select jsonb_build_object(
      'revenue_by_erp', (select coalesce(jsonb_agg(a.*), '[]') from approved a),
      'prev_week_revenue', (select coalesce(jsonb_agg(p.*), '[]') from prev_week p),
      'pending_by_erp', (select coalesce(jsonb_agg(pd.*), '[]') from pending pd),
      'rejected_top3', (select coalesce(jsonb_agg(r.*), '[]') from rejected_reasons r)
    ) as result
  `;
  return { rows: await runSafe(sb, q), query: q.trim() };
}

/** § 2 핫팩 시즌 — daily_performance + sku_master JOIN (sku_category 뷰 없음) */
export async function sqlHotpackSeasonSection(
  sb: SupabaseClient,
  ws: string,
  we: string
): Promise<SectionResult> {
  const q = `
    select jsonb_build_object(
      'category_gmv', (
        select coalesce(jsonb_agg(x.*), '[]')
        from (
          select sm.detail_category,
                 sum(dp.gmv) as gmv,
                 sum(dp.units_sold) as units
          from daily_performance dp
          join sku_master sm on sm.sku_id = dp.sku_id
          where dp.sale_date between '${ws}'::date and '${we}'::date
            and sm.detail_category in ('보온소품','찜질용품','안대/아이마스크')
          group by sm.detail_category
          order by gmv desc
        ) x
      ),
      'prev_week_gmv', (
        select coalesce(jsonb_agg(x.*), '[]')
        from (
          select sm.detail_category,
                 sum(dp.gmv) as gmv,
                 sum(dp.units_sold) as units
          from daily_performance dp
          join sku_master sm on sm.sku_id = dp.sku_id
          where dp.sale_date between '${ws}'::date - 7 and '${ws}'::date - 1
            and sm.detail_category in ('보온소품','찜질용품','안대/아이마스크')
          group by sm.detail_category
        ) x
      ),
      'season_triggers', (
        select coalesce(jsonb_agg(t.*), '[]')
        from v_hotpack_triggers t
        where t.date between '${ws}'::date and '${we}'::date
          and (t.cold_shock or t.first_freeze or t.search_spike_any or t.compound)
      ),
      'season_daily', (
        select coalesce(jsonb_agg(d.*), '[]')
        from v_hotpack_season_daily d
        where d.date between '${ws}'::date and '${we}'::date
        order by d.date
      )
    ) as result
  `;
  return { rows: await runSafe(sb, q), query: q.trim() };
}

/** § 2' 비시즌 — item_master + orders 직접 */
export async function sqlOffseasonSection(
  sb: SupabaseClient,
  ws: string,
  we: string
): Promise<SectionResult> {
  const q = `
    select jsonb_build_object(
      'category_revenue', (
        select coalesce(jsonb_agg(x.*), '[]')
        from (
          select im.category,
                 count(distinct o.item_id) as item_count,
                 sum(o.quantity) as units,
                 sum(o.total_amount) as revenue
          from orders o
          join item_master im on im.item_id = o.item_id
          where o.tx_date between '${ws}'::date and '${we}'::date
            and o.tx_type = 'sale'
            and o.status = 'approved'
            and o.is_internal = false
            and im.category not in ('핫팩','손난로','아이워머','찜질팩')
            and im.is_active = true
          group by im.category
          order by revenue desc nulls last
          limit 10
        ) x
      )
    ) as result
  `;
  return { rows: await runSafe(sb, q), query: q.trim() };
}

/** § 3 총재고 — ERP(v_current_stock) + 쿠팡(inventory_operation) + 안전재고(v_stock_alert) */
export async function sqlInventorySection(
  sb: SupabaseClient,
  _ws: string,
  _we: string
): Promise<SectionResult> {
  const q = `
    select jsonb_build_object(
      'erp_stock_by_category', (
        select coalesce(jsonb_agg(x.*), '[]')
        from (
          select category,
                 sum(current_stock) as stock_qty,
                 count(*) as item_count
          from v_current_stock
          where is_active = true
          group by category
          order by stock_qty desc
        ) x
      ),
      'coupang_stock_latest', (
        select coalesce(jsonb_agg(x.*), '[]')
        from (
          select sm.detail_category,
                 sum(io.current_stock) as stock_qty,
                 count(*) as sku_count
          from inventory_operation io
          join sku_master sm on sm.sku_id = io.sku_id
          where io.op_date = (select max(op_date) from inventory_operation)
          group by sm.detail_category
          order by stock_qty desc
        ) x
      ),
      'safety_stock_alerts', (
        select coalesce(jsonb_agg(a.*), '[]')
        from (
          select sku_name, current_stock, safety_stock_qty,
                 stock_gap, is_stockout, order_status
          from v_stock_alert
          order by stock_gap desc nulls last
          limit 15
        ) a
      )
    ) as result
  `;
  return { rows: await runSafe(sb, q), query: q.trim() };
}

/** § 4 수입 리드타임 — import_leadtime 직접 */
export async function sqlImportLeadtimeSection(
  sb: SupabaseClient,
  _ws: string,
  _we: string
): Promise<SectionResult> {
  const q = `
    select jsonb_build_object(
      'in_progress', (
        select coalesce(jsonb_agg(x.*), '[]')
        from (
          select po_number, bl_number, product_name, vessel_name,
                 step1_actual, step2_actual, step3_actual,
                 step4_expected, step4_actual,
                 case
                   when step4_actual is not null then '완료'
                   when step3_actual is not null then '통관완료'
                   when step2_actual is not null then '해상운송중'
                   when step1_actual is not null then '출고완료'
                   else '준비중'
                 end as current_stage,
                 (step4_expected - current_date) as days_to_arrival
          from import_leadtime
          where (step4_actual is null or step4_actual >= current_date - 7)
            and is_approved = true
          order by coalesce(step4_expected, step4_actual) asc
          limit 20
        ) x
      ),
      'delayed', (
        select coalesce(jsonb_agg(x.*), '[]')
        from (
          select po_number, bl_number, product_name,
                 step4_expected, (current_date - step4_expected) as delay_days
          from import_leadtime
          where step4_actual is null
            and step4_expected is not null
            and step4_expected < current_date
          order by step4_expected asc
          limit 10
        ) x
      )
    ) as result
  `;
  return { rows: await runSafe(sb, q), query: q.trim() };
}

/** § 5 밀크런 — allocations (order_date 기반) */
export async function sqlMilkrunSection(
  sb: SupabaseClient,
  ws: string,
  we: string
): Promise<SectionResult> {
  const q = `
    select jsonb_build_object(
      'this_week', (
        select coalesce(jsonb_agg(x.*), '[]')
        from (
          select a.id, a.order_date, a.total_cost,
                 a.total_pallets, a.center_count, a.memo
          from allocations a
          where a.order_date between '${ws}'::date and '${we}'::date
          order by a.order_date desc
        ) x
      ),
      'upcoming_2w', (
        select coalesce(jsonb_agg(x.*), '[]')
        from (
          select a.id, a.order_date, a.total_cost,
                 a.total_pallets, a.center_count
          from allocations a
          where a.order_date between current_date and current_date + 14
          order by a.order_date
        ) x
      )
    ) as result
  `;
  return { rows: await runSafe(sb, q), query: q.trim() };
}

/** § 6 외부 — 서울 날씨(v_weather_hybrid) + 키워드(v_keyword_daily_with_ma) */
export async function sqlExternalSection(
  sb: SupabaseClient,
  ws: string,
  we: string
): Promise<SectionResult> {
  const q = `
    select jsonb_build_object(
      'weather_past_week', (
        select coalesce(jsonb_agg(x.*), '[]')
        from (
          select weather_date, temp_min, temp_max, temp_avg,
                 precipitation, snowfall
          from v_weather_hybrid
          where weather_date between '${ws}'::date and '${we}'::date
            and station = '서울'
          order by weather_date
        ) x
      ),
      'weather_forecast', (
        select coalesce(jsonb_agg(x.*), '[]')
        from (
          select weather_date, temp_min, temp_max, precipitation
          from weather_unified
          where weather_date between '${we}'::date + 1 and '${we}'::date + 7
            and station = '서울'
            and source in ('forecast','forecast_short','forecast_mid')
          order by weather_date
        ) x
      ),
      'keyword_4w', (
        select coalesce(jsonb_agg(x.*), '[]')
        from (
          select trend_date, keyword, search_index, ma_7d, ratio_to_ma
          from v_keyword_daily_with_ma
          where trend_date between '${ws}'::date - 21 and '${we}'::date
            and keyword in ('핫팩','손난로','아이워머','찜질팩')
          order by trend_date desc, keyword
        ) x
      ),
      'new_competitors', (
        select coalesce(jsonb_agg(x.*), '[]')
        from (
          select product_name, brand, rank, rating, review_count, category
          from competitor_products
          where collected_at between '${ws}'::date and '${we}'::date
          order by collected_at desc
          limit 10
        ) x
      )
    ) as result
  `;
  return { rows: await runSafe(sb, q), query: q.trim() };
}

/** § 7 납품 미준수 — 개별 에러 컬럼 합산 */
export async function sqlNoncomplianceSection(
  sb: SupabaseClient,
  ws: string,
  _we: string
): Promise<SectionResult> {
  const q = `
    with this_week as (
      select * from noncompliant_delivery
      where year_week = to_char('${ws}'::date, 'IYYYIW')
    ),
    prev_week as (
      select * from noncompliant_delivery
      where year_week = to_char('${ws}'::date - 7, 'IYYYIW')
    )
    select jsonb_build_object(
      'this_week_total', (
        select coalesce(sum(total_noncompliance), 0) from this_week
      ),
      'prev_week_total', (
        select coalesce(sum(total_noncompliance), 0) from prev_week
      ),
      'by_error_type', (
        select coalesce(jsonb_agg(x.*), '[]')
        from (
          select
            sum(barcode_error)     as barcode_error,
            sum(expiry_error)      as expiry_error,
            sum(damaged)           as damaged,
            sum(under_delivery)    as under_delivery,
            sum(over_delivery)     as over_delivery,
            sum(wrong_packaging)   as wrong_packaging,
            sum(wrong_fc)          as wrong_fc,
            sum(wrong_item)        as wrong_item,
            sum(invalid_info)      as invalid_info,
            sum(statement_missing) as statement_missing
          from this_week
        ) x
      ),
      'by_category', (
        select coalesce(jsonb_agg(x.*), '[]')
        from (
          select product_category, sub_category, sum(total_noncompliance) as cnt
          from this_week
          group by product_category, sub_category
          order by cnt desc
          limit 5
        ) x
      )
    ) as result
  `;
  return { rows: await runSafe(sb, q), query: q.trim() };
}
