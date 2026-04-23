-- ============================================================
-- 하루루 Phase 1 Step 1.6 — 백필 함수 4개
-- 설계 문서: scripts/02_pipeline.md § 3
--
-- backfill_rag_glossary_all()  — 마스터 용어집 일괄 생성/갱신
-- backfill_rag_analysis_all()  — 기존 LLM 리포트 백필
-- build_weekly_rag_events(date) — 지정 주차 카테고리별 요약 카드
-- count_missing_embeddings()   — 임베딩 누락 row 카운트
-- ============================================================

-- ------------------------------------------------------------
-- 1. backfill_rag_glossary_all
-- ------------------------------------------------------------
create or replace function public.backfill_rag_glossary_all()
returns table (kind text, inserted int) language plpgsql as $$
declare
  v_item_inserted int;
  v_sku_inserted int;
  v_keyword_inserted int;
  v_station_inserted int;
  v_trigger_inserted int;
  v_internal_inserted int;
begin
  -- ITEM: item_master + erp_mapping + coupang_mapping 통합 카드
  with src as (
    select
      im.item_id,
      im.item_name_raw,
      im.item_name_norm,
      im.category,
      im.item_type,
      im.channel_variant,
      im.unit_count,
      im.unit_label,
      im.base_cost,
      im.is_active,
      im.notes,
      (select string_agg(
          format('  - %s ERP 코드: %s',
                 case iem.erp_system
                   when 'gl' then 'GL'
                   when 'glpharm' then '지엘팜'
                   when 'hnb' then 'HNB'
                 end,
                 coalesce(iem.erp_code, '(미취급)')
          ), E'\n')
         from item_erp_mapping iem where iem.item_id = im.item_id) as erp_block,
      (select string_agg(
          format('  - 쿠팡 SKU: %s (번들배수 %s)',
                 icm.coupang_sku_id, icm.bundle_ratio),
          E'\n')
         from item_coupang_mapping icm
        where icm.item_id = im.item_id
          and icm.mapping_status in ('verified','ai_suggested')
      ) as coupang_block
    from item_master im
  )
  insert into rag_glossary
    (kind, key, content, scope, source_table, source_pk, updated_at)
  select
    'item',
    src.item_id::text,
    format(E'[품목] %s\n- item_id: %s\n- 정규 이름: %s\n- 카테고리: %s / %s\n- 단위: %s %s\n- 기본 원가: %s원\n- 채널 변종: %s\n- 활성: %s\n%s\n%s%s',
      src.item_name_raw,
      src.item_id,
      coalesce(src.item_name_norm, '-'),
      coalesce(src.category, '-'),
      coalesce(src.item_type, '-'),
      coalesce(src.unit_count::text, '-'),
      coalesce(src.unit_label, ''),
      coalesce(src.base_cost::text, '-'),
      coalesce(src.channel_variant, '기본'),
      case when src.is_active then 'Y' else 'N' end,
      coalesce(src.erp_block, '  - ERP 매핑 없음'),
      coalesce(src.coupang_block, '  - 쿠팡 매핑 없음'),
      case when src.notes is not null then E'\n- 비고: '||src.notes else '' end
    ),
    jsonb_build_object(
      'category', src.category,
      'is_active', src.is_active,
      'channel_variant', src.channel_variant,
      'axis', 'erp'
    ),
    'item_master',
    jsonb_build_object('item_id', src.item_id),
    now()
  from src
  on conflict (kind, key) do update
    set content = excluded.content,
        scope = excluded.scope,
        embedding = null,
        updated_at = now();
  get diagnostics v_item_inserted = row_count;

  -- SKU
  insert into rag_glossary (kind, key, content, scope, source_table, source_pk, updated_at)
  select
    'sku',
    sm.sku_id,
    format(E'[쿠팡 SKU] %s\n- SKU ID: %s\n- 브랜드: %s\n- 카테고리: %s / %s / %s\n- 바코드: %s\n- 로켓프레시: %s',
      sm.sku_name, sm.sku_id,
      coalesce(sm.brand, '-'),
      coalesce(sm.product_category, '-'),
      coalesce(sm.sub_category, '-'),
      coalesce(sm.detail_category, '-'),
      coalesce(sm.barcode, '-'),
      case when sm.is_rocket_fresh then 'Y' else 'N' end
    ),
    jsonb_build_object(
      'brand', sm.brand,
      'product_category', sm.product_category,
      'is_rocket_fresh', sm.is_rocket_fresh,
      'axis', 'coupang'
    ),
    'sku_master',
    jsonb_build_object('sku_id', sm.sku_id),
    now()
  from sku_master sm
  on conflict (kind, key) do update
    set content = excluded.content, scope = excluded.scope,
        embedding = null, updated_at = now();
  get diagnostics v_sku_inserted = row_count;

  -- KEYWORD
  insert into rag_glossary (kind, key, content, scope, source_table, source_pk, updated_at)
  select
    'keyword',
    kc.keyword,
    format(E'[키워드] %s (%s)\n- 표시명: %s\n- 분류: %s\n- 활성: %s%s',
      kc.keyword, kc.category,
      coalesce(kc.display_name, kc.keyword),
      case kc.category
        when 'primary' then '총괄 검색어'
        when 'variant' then '변종(타입별 선행지표)'
        when 'substitute' then '대체재'
        when 'related' then '관련 참고'
      end,
      case when kc.is_active then 'Y' else 'N' end,
      case when kc.notes is not null then E'\n- 비고: '||kc.notes else '' end
    ),
    jsonb_build_object('category', kc.category, 'is_active', kc.is_active),
    'keyword_catalog',
    jsonb_build_object('keyword', kc.keyword),
    now()
  from keyword_catalog kc
  on conflict (kind, key) do update
    set content = excluded.content, scope = excluded.scope,
        embedding = null, updated_at = now();
  get diagnostics v_keyword_inserted = row_count;

  -- STATION
  insert into rag_glossary (kind, key, content, scope, source_table, source_pk, updated_at)
  select
    'station',
    sc.station_code,
    format(E'[관측소] %s (%s)\n- 코드: %s\n- ASOS ID: %s\n- 활성: %s',
      sc.station_kor_name, sc.station_code,
      sc.station_code, coalesce(sc.asos_stn_id, '-'),
      case when sc.is_active then 'Y' else 'N' end
    ),
    jsonb_build_object('is_active', sc.is_active),
    'station_catalog',
    jsonb_build_object('station_code', sc.station_code),
    now()
  from station_catalog sc
  on conflict (kind, key) do update
    set content = excluded.content, embedding = null, updated_at = now();
  get diagnostics v_station_inserted = row_count;

  -- TRIGGER RULE
  insert into rag_glossary (kind, key, content, scope, source_table, source_pk, updated_at)
  select
    'trigger_rule',
    tc.trigger_key,
    format(E'[트리거 규칙] %s\n- 임계값: %s %s\n- 설명: %s\n- 활성: %s',
      tc.trigger_key,
      tc.threshold, coalesce(tc.unit, ''),
      coalesce(tc.description, '-'),
      case when tc.is_active then 'Y' else 'N' end
    ),
    jsonb_build_object('is_active', tc.is_active),
    'trigger_config',
    jsonb_build_object('trigger_key', tc.trigger_key),
    now()
  from trigger_config tc
  on conflict (kind, key) do update
    set content = excluded.content, embedding = null, updated_at = now();
  get diagnostics v_trigger_inserted = row_count;

  -- INTERNAL ENTITY
  insert into rag_glossary (kind, key, content, scope, source_table, source_pk, updated_at)
  select
    'internal_entity',
    ie.entity_id::text,
    format(E'[자사 법인 패턴] %s\n- ERP: %s\n- 매칭: %s (%s)\n- 비고: %s',
      ie.pattern,
      ie.erp_system, ie.match_type, ie.pattern,
      coalesce(ie.note, '-')
    ),
    jsonb_build_object('erp_system', ie.erp_system, 'is_active', ie.is_active, 'axis', 'erp'),
    'internal_entities',
    jsonb_build_object('entity_id', ie.entity_id),
    now()
  from internal_entities ie
  on conflict (kind, key) do update
    set content = excluded.content, embedding = null, updated_at = now();
  get diagnostics v_internal_inserted = row_count;

  return query values
    ('item', v_item_inserted),
    ('sku', v_sku_inserted),
    ('keyword', v_keyword_inserted),
    ('station', v_station_inserted),
    ('trigger_rule', v_trigger_inserted),
    ('internal_entity', v_internal_inserted);
end $$;


-- ------------------------------------------------------------
-- 2. backfill_rag_analysis_all
-- ------------------------------------------------------------
create or replace function public.backfill_rag_analysis_all()
returns table (source_table text, inserted int) language plpgsql as $$
declare
  v_reports int;
  v_day int;
  v_snapshots int;
begin
  insert into rag_analysis
    (source_table, source_pk, scope, title, content, chunk_index, chunk_total,
     created_at, updated_at)
  select
    'hotpack_llm_reports',
    jsonb_build_object('id', r.id::text),
    jsonb_build_object('season', r.season, 'kind', r.kind, 'model', r.model, 'axis', 'coupang'),
    format('[%s] %s', r.season, r.kind),
    r.body_md,
    0, 1,
    r.generated_at, now()
  from hotpack_llm_reports r
  on conflict (source_table, source_pk, chunk_index) do update
    set content = excluded.content, scope = excluded.scope,
        title = excluded.title, embedding = null, updated_at = now();
  get diagnostics v_reports = row_count;

  insert into rag_analysis
    (source_table, source_pk, scope, title, content, chunk_index, chunk_total,
     created_at, updated_at)
  select
    'hotpack_day_analysis',
    jsonb_build_object('season', r.season, 'date', r.date::text),
    jsonb_build_object('season', r.season, 'date', r.date, 'kind', 'day_analysis', 'axis', 'coupang'),
    format('[%s] %s 일자 분석', r.season, r.date),
    r.body,
    0, 1,
    r.generated_at, now()
  from hotpack_day_analysis r
  on conflict (source_table, source_pk, chunk_index) do update
    set content = excluded.content, scope = excluded.scope,
        embedding = null, updated_at = now();
  get diagnostics v_day = row_count;

  insert into rag_analysis
    (source_table, source_pk, scope, title, content, chunk_index, chunk_total,
     created_at, updated_at)
  select
    'coupang_sku_ai_analysis_snapshots',
    jsonb_build_object('id', r.id::text),
    jsonb_build_object(
      'sku_id', r.sku_id,
      'center_label', r.center_label,
      'base_op_date', r.base_op_date,
      'period_start', r.period_start,
      'period_end', r.period_end,
      'kind', 'sku_inventory_analysis',
      'axis', 'coupang'
    ),
    coalesce(r.title, '쿠팡 센터 SKU 분석'),
    format(E'%s\n\n%s',
      coalesce(r.sku_display_name, r.sku_id),
      r.body
    ),
    0, 1,
    r.created_at, now()
  from coupang_sku_ai_analysis_snapshots r
  on conflict (source_table, source_pk, chunk_index) do update
    set content = excluded.content, scope = excluded.scope,
        embedding = null, updated_at = now();
  get diagnostics v_snapshots = row_count;

  return query values
    ('hotpack_llm_reports', v_reports),
    ('hotpack_day_analysis', v_day),
    ('coupang_sku_ai_analysis_snapshots', v_snapshots);
end $$;


-- ------------------------------------------------------------
-- 3. build_weekly_rag_events
--    p_week_start 기준 카테고리별 주간 요약 카드 생성
-- ------------------------------------------------------------
create or replace function public.build_weekly_rag_events(p_week_start date)
returns int language plpgsql as $$
declare
  v_inserted int := 0;
begin
  with week_range as (
    select p_week_start as ws, p_week_start + 6 as we
  ),
  sales as (
    select
      sm.product_category,
      sum(dp.gmv) as gmv,
      sum(dp.units_sold) as units,
      count(distinct case when dp.units_sold > 0 then dp.sku_id end) as active_skus,
      avg(dp.conversion_rate) filter (where dp.conversion_rate > 0) as avg_cvr,
      sum(dp.promo_gmv) as promo_gmv
    from daily_performance dp
    join sku_master sm on sm.sku_id = dp.sku_id
    join week_range w on dp.sale_date between w.ws and w.we
    where sm.product_category in ('핫팩','손난로','아이워머','찜질팩')
    group by sm.product_category
  ),
  stockouts as (
    select sm.product_category,
           count(distinct io.op_date) filter (where io.is_stockout) as stockout_days,
           array_agg(distinct io.sku_id) filter (where io.is_stockout) as stockout_skus
    from inventory_operation io
    join sku_master sm on sm.sku_id = io.sku_id
    join week_range w on io.op_date between w.ws and w.we
    where sm.product_category in ('핫팩','손난로','아이워머','찜질팩')
    group by sm.product_category
  ),
  weather as (
    select
      round(avg(temp_avg)::numeric, 1) as tavg,
      round(avg(temp_min)::numeric, 1) as tmin,
      sum(case when temp_min < 0 then 1 else 0 end) as cold_days
    from weather_unified w, week_range r
    where w.source = 'asos' and w.station = '서울'
      and w.weather_date between r.ws and r.we
  ),
  kw as (
    select round(avg(kt.search_index)::numeric, 1) as hotpack_idx
    from keyword_trends kt, week_range r
    where kt.keyword = '핫팩'
      and kt.trend_date between r.ws and r.we
  ),
  top_sku as (
    select sm.product_category,
           array_agg(x.sku_id order by x.units desc) filter (where x.rnk <= 3) as top3
    from (
      select dp.sku_id, sum(dp.units_sold) as units,
             rank() over (partition by sm2.product_category order by sum(dp.units_sold) desc) as rnk,
             sm2.product_category
      from daily_performance dp
      join sku_master sm2 on sm2.sku_id = dp.sku_id
      join week_range w on dp.sale_date between w.ws and w.we
      where sm2.product_category in ('핫팩','손난로','아이워머','찜질팩')
      group by dp.sku_id, sm2.product_category
    ) x
    join sku_master sm on sm.sku_id = x.sku_id
    group by sm.product_category
  )
  insert into rag_events
    (event_type, event_date, scope, content, metrics, generated_by, generated_at)
  select
    'weekly_summary',
    p_week_start,
    jsonb_build_object(
      'week_start', p_week_start,
      'week_end', p_week_start + 6,
      'category', s.product_category,
      'axis', 'coupang'
    ),
    format(
      E'[주간 요약] %s (%s~%s) / %s 카테고리 (쿠팡 B2C 기준)\n' ||
      E'- 총 GMV: %s원\n- 총 판매: %s개\n- 활성 SKU 수: %s\n' ||
      E'- 평균 전환율: %s%%\n- 프로모션 GMV 비중: %s%%\n' ||
      E'- 주력 SKU TOP3: %s\n' ||
      E'- 결품 일수: %s일, 대상 SKU: %s\n' ||
      E'- 서울 평균기온: %s°C, 최저 평균: %s°C, 한파일: %s\n' ||
      E'- 핫팩 검색지수 평균: %s\n' ||
      E'- 근거 수치(JSON): {"gmv":%s,"units":%s,"stockout_days":%s,"tavg":%s,"tmin":%s,"cold_days":%s,"hotpack_kw_idx":%s}',
      to_char(p_week_start, 'IYYY-"W"IW'),
      to_char(p_week_start, 'MM/DD'),
      to_char(p_week_start + 6, 'MM/DD'),
      s.product_category,
      to_char(s.gmv, 'FM999,999,999,999'),
      to_char(s.units, 'FM999,999,999'),
      s.active_skus,
      round(coalesce(s.avg_cvr, 0) * 100, 2),
      round(case when s.gmv > 0 then s.promo_gmv / s.gmv * 100 else 0 end, 1),
      coalesce(array_to_string(ts.top3, ', '), '-'),
      coalesce(so.stockout_days, 0),
      coalesce(array_to_string(so.stockout_skus, ', '), '없음'),
      coalesce(wt.tavg::text, '-'),
      coalesce(wt.tmin::text, '-'),
      coalesce(wt.cold_days::text, '0'),
      coalesce(k.hotpack_idx::text, '-'),
      s.gmv, s.units, coalesce(so.stockout_days, 0),
      wt.tavg, wt.tmin, coalesce(wt.cold_days, 0), k.hotpack_idx
    ),
    jsonb_build_object(
      'gmv', s.gmv,
      'units', s.units,
      'active_skus', s.active_skus,
      'stockout_days', coalesce(so.stockout_days, 0),
      'stockout_skus', coalesce(so.stockout_skus, '{}'::text[]),
      'tavg', wt.tavg,
      'tmin', wt.tmin,
      'cold_days', coalesce(wt.cold_days, 0),
      'hotpack_kw_idx', k.hotpack_idx,
      'top3_sku', ts.top3,
      'axis', 'coupang'
    ),
    'cron:weekly_summary',
    now()
  from sales s
  left join stockouts so on so.product_category = s.product_category
  left join top_sku ts on ts.product_category = s.product_category
  cross join weather wt
  cross join kw k
  on conflict (event_type, event_date,
               coalesce(sku_id, ''),
               coalesce((scope->>'category'), '')) do update
    set content = excluded.content, metrics = excluded.metrics,
        embedding = null, generated_at = now();

  get diagnostics v_inserted = row_count;
  return v_inserted;
end $$;


-- ------------------------------------------------------------
-- 4. count_missing_embeddings
-- ------------------------------------------------------------
create or replace function public.count_missing_embeddings()
returns table (target_table text, missing int) language sql stable as $$
  select 'rag_glossary', count(*)::int from rag_glossary where embedding is null
  union all
  select 'rag_analysis', count(*)::int from rag_analysis where embedding is null
  union all
  select 'rag_events', count(*)::int from rag_events where embedding is null;
$$;
