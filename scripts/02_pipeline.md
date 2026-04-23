# 02. 백필 & 자동 갱신 파이프라인

> Lite 버전: 복잡한 큐·트리거·워커 생태계는 Phase 2로 미루고, **수동 백필 SQL 함수 + 주 1회 cron + 임베딩 Edge Function 1개** 로 시작한다.

---

## 1. 설계 원칙 (Lite)

1. **임베딩 분리**: RAG 테이블에 일단 `content`만 채우고 `embedding`은 NULL. 이후 Edge Function이 `embedding IS NULL` 인 row를 배치 처리.
2. **수동 트리거 우선**: 원본 변경 시 자동 갱신하지 않고, 관리자가 백필 함수를 호출하거나 cron이 돌림. Phase 2에서 DB 트리거 + 큐로 자동화.
3. **주간 카드만 자동**: `rag_events`의 `weekly_summary`만 매주 월요일 cron으로 자동 생성. 나머지 event_type은 Phase 2.
4. **결정적 템플릿**: 카드 생성에 LLM 호출 없음. `format()` + 수치 치환. 같은 input → 같은 content → 임베딩 변경 없음.

---

## 2. Phase 1 파이프라인 전체 흐름

```
[관리자 수동 실행 / cron 자동 실행]
        ↓
[SQL 함수: backfill_* / build_weekly_*]
        ↓
[RAG 테이블에 content INSERT/UPSERT, embedding=NULL]
        ↓
[cron: 10분마다 rag-embed-missing Edge Function 호출]
        ↓
[Edge Function이 OpenAI API 호출 → embedding UPDATE]
        ↓
[v_rag_health 뷰로 상태 확인]
```

---

## 3. 백필 SQL 함수

### 3-1. `backfill_rag_glossary_all()` — 마스터 용어집 일괄 생성

```sql
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
        embedding = null,   -- 내용 바뀌면 재임베딩
        updated_at = now();
  get diagnostics v_item_inserted = row_count;

  -- SKU: sku_master 단독
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

  -- INTERNAL ENTITY (자사 법인 alias)
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
```

### 3-2. `backfill_rag_analysis_all()` — LLM 리포트 백필

```sql
create or replace function public.backfill_rag_analysis_all()
returns table (source_table text, inserted int) language plpgsql as $$
declare
  v_reports int;
  v_day int;
  v_snapshots int;
begin
  -- hotpack_llm_reports
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

  -- hotpack_day_analysis
  -- PK는 (season, date). jsonb_build_object가 key 순서 보장하므로 safe.
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

  -- coupang_sku_ai_analysis_snapshots
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
```

> **참고**: `body_md`가 긴 경우 섹션 분할이 이상적이지만 Phase 1은 단일 chunk로 저장. 평가에서 정밀도 문제 발견 시 섹션 분할 로직 추가.

### 3-3. `build_weekly_rag_events(week_start date)` — 주간 요약 카드

```sql
create or replace function public.build_weekly_rag_events(p_week_start date)
returns int language plpgsql as $$
declare
  v_inserted int := 0;
begin
  -- 카테고리 단위 주간 요약 (쿠팡 축, B2C 기준)
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
  -- ⚠️ unique 제약이 scope->category까지 보므로 카테고리별 row가 충돌 없이 각자 저장
  on conflict (event_type, event_date,
               coalesce(sku_id, ''),
               coalesce((scope->>'category'), '')) do update
    set content = excluded.content, metrics = excluded.metrics,
        embedding = null, generated_at = now();

  get diagnostics v_inserted = row_count;
  return v_inserted;
end $$;
```

> Phase 1은 쿠팡 축 주간 카드만 생성. ERP 축 주간 카드는 Phase 2 (사용자 수요에 따라).

### 3-4. 범용 유틸 — 임베딩 없는 row 카운트

```sql
create or replace function public.count_missing_embeddings()
returns table (target_table text, missing int) language sql stable as $$
  select 'rag_glossary', count(*)::int from rag_glossary where embedding is null
  union all
  select 'rag_analysis', count(*)::int from rag_analysis where embedding is null
  union all
  select 'rag_events', count(*)::int from rag_events where embedding is null;
$$;
```

---

## 4. Edge Function: `rag-embed-missing`

임베딩 없는 row를 배치 처리. 기존 `generate-season-brief`의 Secrets·패턴 재사용.

### 4-1. 필요한 환경 변수

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY` ← **신규 등록 필요**

### 4-2. 함수 코드

```typescript
// supabase/functions/rag-embed-missing/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const EMBED_MODEL = "text-embedding-3-small";
const BATCH_SIZE = 32; // OpenAI 단일 호출 당 입력 개수
const MAX_BATCHES_PER_RUN = 4; // 1회 실행당 최대 배치 수 (128건)
const TABLES = ["rag_glossary", "rag_analysis", "rag_events"] as const;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function embedBatch(texts: string[], apiKey: string): Promise<number[][]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI ${res.status}: ${t.slice(0, 400)}`);
  }
  const json = await res.json();
  return json.data.map((d: { embedding: number[] }) => d.embedding);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return Response.json(
        { ok: false, error: "OPENAI_API_KEY Secret 미설정" },
        { status: 503, headers: corsHeaders }
      );
    }

    const report: Record<string, number> = {};

    for (const table of TABLES) {
      let processed = 0;
      for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
        const { data: rows, error } = await supabase
          .from(table)
          .select("id, content")
          .is("embedding", null)
          .limit(BATCH_SIZE);
        if (error) throw new Error(`${table} select: ${error.message}`);
        if (!rows || rows.length === 0) break;

        const embeddings = await embedBatch(
          rows.map((r: { content: string }) => r.content),
          openaiKey
        );

        // 개별 update (행마다 embedding이 다름)
        for (let i = 0; i < rows.length; i++) {
          const { error: ue } = await supabase
            .from(table)
            .update({ embedding: embeddings[i], updated_at: new Date().toISOString() })
            .eq("id", rows[i].id);
          if (ue) console.error(`${table} update id=${rows[i].id}: ${ue.message}`);
        }
        processed += rows.length;
      }
      report[table] = processed;
    }

    return Response.json({ ok: true, processed: report }, { headers: corsHeaders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: msg }, { status: 500, headers: corsHeaders });
  }
});
```

### 4-3. 배포 & 시크릿 등록

```bash
# Supabase CLI
supabase functions deploy rag-embed-missing --no-verify-jwt
supabase secrets set OPENAI_API_KEY=sk-...
```

> `--no-verify-jwt`는 cron에서 호출할 수 있게. 운영 시 URL 유출 방지 위해 Secret으로 `CRON_SHARED_TOKEN` 추가 검증 로직을 덧붙여도 됨 (Phase 2).

---

## 5. pg_cron 스케줄

```sql
-- 1) 매주 월 02:00 — 지난주 요약 카드 생성
select cron.schedule(
  'rag-weekly-summary',
  '0 2 * * 1',
  $$
    select public.build_weekly_rag_events(
      (date_trunc('week', current_date)::date - 7)
    );
  $$
);

-- 2) 매 10분마다 — 임베딩 누락 row 처리
select cron.schedule(
  'rag-embed-missing',
  '*/10 * * * *',
  $$
    select net.http_post(
      url := 'https://sbyglmzogaiwbwfjhrmo.functions.supabase.co/rag-embed-missing',
      headers := jsonb_build_object('content-type', 'application/json'),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $$
);
```

> **주의**: `pg_net` URL은 프로젝트 ID로 구성. 프로젝트 URL: `https://sbyglmzogaiwbwfjhrmo.functions.supabase.co`

### 5-1. cron 상태 확인 쿼리

```sql
select jobid, schedule, command, active
from cron.job
where jobname like 'rag-%';

select jobname, status, return_message, start_time, end_time
from cron.job_run_details jrd
join cron.job j using (jobid)
where j.jobname like 'rag-%'
order by start_time desc
limit 20;
```

---

## 6. 운영 관측 뷰

```sql
create or replace view public.v_rag_health as
with counts as (
  select 'rag_glossary' as t,
         count(*) as total,
         count(*) filter (where embedding is not null) as embedded,
         count(*) filter (where embedding is null) as missing,
         max(updated_at) as last_updated
  from rag_glossary
  union all
  select 'rag_analysis',
         count(*),
         count(*) filter (where embedding is not null),
         count(*) filter (where embedding is null),
         max(updated_at)
  from rag_analysis
  union all
  select 'rag_events',
         count(*),
         count(*) filter (where embedding is not null),
         count(*) filter (where embedding is null),
         max(generated_at)
  from rag_events
)
select t as target_table, total, embedded, missing,
       case when total > 0
            then round(embedded::numeric / total * 100, 1)
            else 0 end as coverage_pct,
       last_updated
from counts;

grant select on public.v_rag_health to authenticated;
```

사용 예:

```sql
select * from v_rag_health;
-- target_table   | total | embedded | missing | coverage_pct | last_updated
-- rag_glossary   |   207 |      207 |       0 |        100.0 | 2026-04-22 02:00
-- rag_analysis   |    13 |       13 |       0 |        100.0 | 2026-04-22 02:00
-- rag_events     |   120 |      120 |       0 |        100.0 | 2026-04-22 02:00
```

---

## 7. 초기 배포 순서 (실행 체크리스트)

```sql
-- (A) 스키마: 01_data_and_rag.md 의 DDL 실행 완료 후

-- (B) 함수 생성
\i functions/backfill_rag_glossary_all.sql
\i functions/backfill_rag_analysis_all.sql
\i functions/build_weekly_rag_events.sql
\i functions/count_missing_embeddings.sql

-- (C) Edge Function 배포 (CLI)
-- supabase functions deploy rag-embed-missing --no-verify-jwt
-- supabase secrets set OPENAI_API_KEY=sk-...

-- (D) 백필 실행
select * from backfill_rag_glossary_all();
-- 예상: item ~144, sku ~59, keyword ~6, station ~5, trigger_rule ~2, internal_entity ~12

select * from backfill_rag_analysis_all();
-- 예상: hotpack_llm_reports 5, hotpack_day_analysis 6, coupang_sku_ai_analysis_snapshots 2

-- (E) 과거 주간 카드 백필 (시즌 시작일부터 현재까지)
do $$
declare
  d date := '2025-10-01';  -- 25시즌 시작 ± 조정
begin
  while d <= current_date loop
    perform build_weekly_rag_events(d);
    d := d + 7;
  end loop;
end $$;

-- (F) cron 등록
-- 위 섹션 5번

-- (G) 임베딩 강제 트리거
select net.http_post(
  url := 'https://sbyglmzogaiwbwfjhrmo.functions.supabase.co/rag-embed-missing',
  headers := jsonb_build_object('content-type','application/json'),
  body := '{}'::jsonb
);

-- (H) 10~30분 후 확인
select * from v_rag_health;
```

---

## 8. Phase 2로 미룬 것 (문서 기록용)

- [ ] `rag_docs` 테이블 및 파이프라인 (orders.memo, stock_movement.memo, inventory_operation.return_reason 등)
- [ ] ERP 축 주간 카드 (`orders` 기반 3법인 주간 요약)
- [ ] DB 트리거 기반 자동 큐 적재 (`rag_embed_queue`)
- [ ] 원본 변경 즉시 재임베딩 (현재는 백필 수동 재실행)
- [ ] 추가 event_type: `stockout`, `weather_extreme`, `keyword_spike`, `noncompliance`, `competitor_snapshot`, `import_delay`
- [ ] 섹션 단위 청킹 (`rag_analysis` 긴 body 대응)
- [ ] 재임베딩 큐 (모델 교체 시 점진적 전환)
- [ ] `order_documents` OCR 파이프라인
- [ ] 일일 비용/호출량 상한

---

## 9. 비용·용량 개산

- 임베딩 모델 `text-embedding-3-small`: $0.02 / 1M token
- 초기 백필 예상 (`rag_glossary` 228 + `rag_analysis` 13 + 주간 카드 약 30주 × 4 카테고리 = 120) → 약 361 rows × 평균 300 token = 108K token → **약 $0.002** (2원 수준)
- 주간 증분: 카테고리 4개 × 1장 = 4 rows/week → 월 16 rows → 무시 가능
- 용량: row 당 1536×4바이트 = 6KB + content 평균 1KB ≈ 7KB. 1천 row = 7MB. Supabase Free 초과 없음

---

## 10. 검증 체크리스트

- [ ] 4개 백필 함수 생성 확인
- [ ] `rag-embed-missing` Edge Function 배포 완료
- [ ] `OPENAI_API_KEY` Secret 등록
- [ ] cron 2개 등록 및 `active=true`
- [ ] 백필 후 `v_rag_health.coverage_pct` 모두 100% 도달
- [ ] `select content from rag_glossary where kind='item' limit 1;` 결과가 사람이 읽을 만한 텍스트인가
- [ ] `select content from rag_events limit 1;` 결과에 "(쿠팡 B2C 기준)" 축 표기가 있고 "근거 수치(JSON)" 블록이 있는가
- [ ] `select scope from rag_events limit 1;` 결과에 `axis='coupang'`이 포함되는가

---

## 11. 다음 단계

본 문서로 **RAG 저장소가 채워지고 주간 자동 갱신이 작동**하는 상태가 됐으면, `03_agent.md`에서 이 저장소를 질문에 연결하는 **평가 + LangGraph 파이프라인**을 다룬다.
