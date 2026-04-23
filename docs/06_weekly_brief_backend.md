# 06. 주간 리포트 · 백엔드 (v0.3)

> 메인 대시보드의 두 번째 핵심 블록.
> **생성**: 시스템 프롬프트 + SQL (기존 대시보드 뷰 재사용).
> **저장 후 RAG 적재**: 챗봇이 나중에 참조 가능.
> **프론트엔드 UI**는 `07_weekly_report_ui.md`, **대시보드 통합**은 `08_dashboard_main.md` 참조.

---

## 1. 설계 원칙 (최종 확정)

| 항목            | 결정                                                                           |
| --------------- | ------------------------------------------------------------------------------ |
| 생성 위치       | 메인 대시보드 (`/dashboard`), 브리핑 카드 아래 주간리포트 카드 하단 CTA        |
| 생성 방식       | **시스템 프롬프트 + SQL**. RAG 검색은 생성 시 사용하지 않음                    |
| RAG 적재        | 생성된 리포트는 `rag_analysis`에 자동 청킹 저장 → 하루루 챗봇이 추후 검색 가능 |
| 생성 주기       | **주 2회 · 월요일·금요일** (Phase 1)                                           |
| 대상 기간       | 생성일 기준 지난 7일                                                           |
| 시간 예외       | 승인 대기·수입 BL·예보·과거 비교는 7일 밖 허용                                 |
| 저장 테이블     | `hotpack_llm_reports` (`kind='weekly_brief'`)                                  |
| TTS             | Supertone API (인사이트 기본 / 섹션별 옵션)                                    |
| STT             | OpenAI Whisper (사용자 음성 질문 → 텍스트. **음성 누적 저장 X**)               |
| 톤              | **공식 사내 보고서 톤** (격식체, 경어체, 이모지 최소)                          |
| 하루루 페르소나 | 이 리포트에는 **적용하지 않음**. 브리핑·챗봇에만 유지                          |

---

## 2. 리포트 구조

### 2-1. 1부 — 파트별 사실 보고 (SQL 기반)

메인 대시보드 네비 구조에 맞춰 7개 섹션. **모든 수치 뒤에 `[ref:sql.섹션.row_N]` 태그 필수**. 공식 톤.

```
주간 보고서 · YYYY-WWW (MM/DD ~ MM/DD)
생성 일시: YYYY-MM-DD HH:mm
보고 기준: 쿠팡 26시즌 · 지엘 ERP 축 병기
────────────────────────────────────

§ 1. 주문 현황 (지엘 ERP)
  - 법인별 매출 합계 (승인 기준, 내부거래 제외)
  - 승인 대기 건수·최장 대기일
  - 주간 반려 건수 및 주요 사유

§ 2. 분석 · 핫팩 시즌 [시즌 중] / 비시즌 품목 [비시즌]
  - 카테고리별 GMV·판매수량 (쿠팡 B2C)
  - 전주 대비 증감률
  - 금주 트리거 발동일

§ 3. 물류 · 총재고
  - 지엘 본사 재고 (ERP)
  - 쿠팡 센터 재고 (쿠팡) — 주말 종가
  - 안전재고 미만 SKU 및 자사 충당 가능 여부

§ 4. 물류 · 수입 리드타임
  - 진행 중 BL 단계별 요약
  - 차주 2주 내 도착 예정 BL
  - 지연 건 및 예상 해소일

§ 5. 물류 · 쿠팡 밀크런
  - 지난주 배정 요약
  - 예정된 배정 (있는 경우)

§ 6. 외부 신호
  - 서울 지난주 날씨 + 차주 예보
  - 주요 키워드 검색지수 4주 추이
  - (경쟁사 수집 데이터 존재 시)

§ 7. 납품 미준수
  - 지난주 미준수 건수 및 주요 사유
  - 전주 대비 증감
```

### 2-2. 2부 — 종합 인사이트 (시스템 프롬프트만으로 작성)

```
이번 주 종합 인사이트

  [헤드라인] 한 줄 요약
  [본문]     3~5 문장 · 섹션 간 인과/패턴/비교 중심
  [주의사항] 3건
  [차주 주목] 3건
```

2부는 **1부 SQL 결과 + 최근 4주 주간 리포트 요약본**을 컨텍스트로 직접 주입하여 작성. 별도의 RAG 검색 호출 없음.

---

## 3. 공식 톤 정의

### 3-1. 원칙

- **경어체·격식체 사용** ("확인되었습니다", "~예상됩니다")
- **이모지 최소화** — 헤더·섹션 구분 아이콘(§··) 외에는 사용 금지
- **"하루루가…" 같은 1인칭 페르소나 금지**
- **객관적 3인칭 보고** ("본 주 승인 건수는…", "전주 대비…")
- **수치는 반드시 `[ref:sql.*]` 태그로 출처 표기**
- **추측·예단 없이 사실과 관측만** 보고 (인사이트 섹션에서만 해석 허용)

### 3-2. 톤 예시

**❌ 잘못된 톤 (하루루 페르소나)**

> "이번 주 군인 핫팩이 날개 돋친 듯 팔렸어요! 재고도 빨리 빠지고 있어서 좀 걱정이에요 😅"

**✅ 올바른 톤 (공식 보고서)**

> "군인 핫팩 160g의 본 주 판매 수량은 4,820개로 집계되었습니다[ref:sql.hotpack_season.row_3]. 전주 대비 62% 증가이며, 이는 11월 18일 서울 최저기온 -7.2°C 기록과 시점이 일치합니다."

### 3-3. 2부 인사이트 톤

2부도 동일 격식체. 다만 **해석·비교·권고**가 허용됨.

**예시**

> "본 주 검색지수 급등은 과거 4주 평균 대비 +182%로 관측되며, 이전 시즌 유사 구간(2024년 W47)에서 검색 급등 후 평균 5.3일차에 쿠팡 판매량 피크가 도달한 선행지표 패턴과 일치합니다. 이에 따라 차주 중반 발주 집중이 예상되므로 군인 핫팩·붙이는 불가마 두 SKU의 쿠팡 재고를 금주 내 보강할 필요가 있습니다."

---

## 4. 시즌별 템플릿 분기

### 4-1. 시즌 판정 함수

```sql
create or replace function public.get_current_report_template()
returns text language sql stable as $$
  select case
    when exists (
      select 1 from season_config
      where current_date between start_date and end_date
        and is_closed = false
    ) then 'hotpack_season'
    else 'off_season'
  end;
$$;
grant execute on function public.get_current_report_template() to authenticated;
```

### 4-2. § 2 섹션 분기

| 기간        | § 2                    | 주력 카테고리               | 데이터 소스                   |
| ----------- | ---------------------- | --------------------------- | ----------------------------- |
| **시즌 중** | § 2. 핫팩 시즌 분석    | 핫팩/손난로/아이워머/찜질팩 | `v_hotpack_season_*` 뷰       |
| **비시즌**  | § 2'. 비시즌 품목 분석 | 쿨링타올·의료용품 등        | `item_master` + `orders` 직접 |

---

## 5. DB 스키마 변경

### 5-1. `hotpack_llm_reports.kind` 업데이트

```sql
alter table hotpack_llm_reports
  drop constraint hotpack_llm_reports_kind_check;

alter table hotpack_llm_reports
  add constraint hotpack_llm_reports_kind_check
    check (kind in (
      'season_brief', 'surge_alert', 'first_breakthrough',
      'season_closing', 'weekly_brief'
    ));
```

### 5-2. 주 2회 · 월/금 가드 함수

```sql
create or replace function public.can_generate_weekly_brief()
returns jsonb language plpgsql stable as $$
declare
  v_week_start date := date_trunc('week', current_date)::date;
  v_count int;
  v_dow int := extract(dow from current_date); -- 0=일, 1=월, 5=금
  v_is_allowed_day boolean := v_dow in (1, 5);
begin
  select count(*) into v_count
  from hotpack_llm_reports
  where kind = 'weekly_brief'
    and generated_at >= v_week_start;

  if not v_is_allowed_day then
    return jsonb_build_object(
      'allowed', false,
      'reason', '주간 리포트는 월요일 또는 금요일에만 생성 가능합니다',
      'count_this_week', v_count,
      'limit', 2,
      'next_available', case when v_dow < 1 then 'this_monday'
                             when v_dow between 2 and 4 then 'this_friday'
                             else 'next_monday' end
    );
  end if;

  if v_count >= 2 then
    return jsonb_build_object(
      'allowed', false,
      'reason', '금주 생성 한도에 도달했습니다 (최대 2회)',
      'count_this_week', v_count,
      'limit', 2
    );
  end if;

  return jsonb_build_object(
    'allowed', true,
    'count_this_week', v_count,
    'limit', 2
  );
end $$;
grant execute on function public.can_generate_weekly_brief() to authenticated;
```

---

## 6. SQL 섹션 쿼리 — 기존 뷰 재사용

각 섹션은 Edge Function에서 병렬로 실행. 기존 대시보드 뷰를 최대한 재활용.

### § 1 주문 (ERP 축)

```sql
-- v_orders_summary 사용 (법인별 매출 · 승인 기준)
with week_range as (
  select $1::date as ws, ($1::date + 6) as we
)
select
  counterparty_group as 법인,
  sum(case when status = 'approved' and is_internal = false
           then total_amount else 0 end) as 승인_매출,
  count(*) filter (where status = 'pending') as 대기_건수,
  max(case when status = 'pending' then (current_date - tx_date) end) as 최장_대기일,
  count(*) filter (where status = 'rejected') as 반려_건수
from orders o, week_range w
where tx_date between w.ws and w.we
  and tx_type = 'sale'
group by counterparty_group
order by 승인_매출 desc;
```

### § 2 핫팩 시즌 분석 [시즌 중]

```sql
-- v_hotpack_season_daily + v_hotpack_triggers 재사용
select
  sku_category,
  sum(gmv) as gmv_주간,
  sum(sales_qty) as 판매수량_주간,
  round(100.0 * (sum(gmv) - lag(sum(gmv)) over (order by sku_category))
        / nullif(lag(sum(gmv)) over (order by sku_category), 0), 1) as 전주대비_pct
from v_hotpack_season_daily
where sales_date between $1 and $2
group by sku_category;
```

### § 2' 비시즌 품목 분석 [비시즌]

```sql
-- 뷰 없음 → item_master + orders 직접
select
  im.category,
  count(distinct o.item_id) as 품목수,
  sum(o.quantity) as 수량_주간,
  sum(o.total_amount) as 매출_주간
from orders o
join item_master im on im.item_id = o.item_id
where o.tx_date between $1 and $2
  and o.tx_type = 'sale'
  and o.status = 'approved'
  and o.is_internal = false
  and im.category not in ('핫팩', '손난로', '아이워머', '찜질팩')
  and im.is_active = true
group by im.category
order by 매출_주간 desc
limit 10;
```

### § 3 총재고

```sql
-- 두 축 분리 표시 (합산 금지)
-- ERP 축
select 'ERP' as 축, category, sum(stock_qty) as 재고수량
from v_current_stock group by category;

-- 쿠팡 축
select 'COUPANG' as 축, sm.category, sum(io.current_stock) as 재고수량
from inventory_operation io
join sku_master sm on sm.sku_id = io.sku_id
where io.snapshot_date = (select max(snapshot_date) from inventory_operation)
group by sm.category;

-- 안전재고 미만 SKU
select sm.category, sm.sku_name, io.current_stock,
       ss.safe_stock_level,
       ss.safe_stock_level - io.current_stock as 부족수량
from inventory_operation io
join sku_master sm on sm.sku_id = io.sku_id
left join safety_stock_config ss on ss.sku_id = io.sku_id
where io.snapshot_date = (select max(snapshot_date) from inventory_operation)
  and io.current_stock < coalesce(ss.safe_stock_level, 100)
order by 부족수량 desc
limit 20;
```

### § 4 수입 리드타임

```sql
-- 뷰 없음 → 직접
select
  po_number, bl_number, product_name,
  step1_actual, step2_actual, step3_actual, step4_expected, step4_actual,
  case
    when step4_actual is not null then '완료'
    when step3_actual is not null then '통관완료'
    when step2_actual is not null then '해상운송중'
    when step1_actual is not null then '출고완료'
    else '준비중'
  end as 현재_단계,
  step4_expected - current_date as 도착까지_일수
from import_leadtime
where (step4_actual is null or step4_actual >= $1)
order by coalesce(step4_expected, step4_actual) asc;
```

### § 5 쿠팡 밀크런

```sql
-- 뷰 없음 → 직접
select
  a.allocation_id, a.departure_date, a.total_amount,
  count(ai.*) as 센터수,
  sum(ai.quantity) as 총수량
from allocations a
left join allocation_items ai on ai.allocation_id = a.allocation_id
where a.departure_date between $1 and ($2 + 14)   -- 향후 2주까지 포함
group by a.allocation_id, a.departure_date, a.total_amount
order by a.departure_date;
```

### § 6 외부 신호

```sql
-- v_weather_hybrid + v_keyword_daily_with_ma
-- 지난주 날씨
select obs_date, station_name,
       temp_min, temp_max, temp_avg, precipitation
from v_weather_hybrid
where obs_date between $1 and $2
  and station_name = '서울';

-- 차주 예보
select forecast_day, temp_min, temp_max
from v_weather_hybrid
where data_source = 'forecast'
  and forecast_day between $2 + 1 and $2 + 7
  and station_name = '서울'
  and issued_date = (select max(issued_date) from v_weather_hybrid where data_source='forecast');

-- 키워드 4주 추이
select obs_date, keyword, index_value, ma_7day
from v_keyword_daily_with_ma
where obs_date between $1 - 21 and $2
  and keyword in ('핫팩', '손난로', '아이워머');
```

### § 7 납품 미준수

```sql
-- 뷰 없음 → 직접 (year_week 기준)
select
  error_type, count(*) as 건수,
  sum(case when error_type in ('결품','지연') then 1 else 0 end) as 치명적_건수
from noncompliant_delivery
where year_week = to_char($1::date, 'IYYYIW')
group by error_type
order by 건수 desc;

-- 전주 비교
with this_week as (
  select count(*) as cnt from noncompliant_delivery
  where year_week = to_char($1::date, 'IYYYIW')
),
last_week as (
  select count(*) as cnt from noncompliant_delivery
  where year_week = to_char(($1::date - 7), 'IYYYIW')
)
select this_week.cnt as 금주, last_week.cnt as 전주,
       this_week.cnt - last_week.cnt as 증감
from this_week, last_week;
```

---

## 7. RAG 결과물 적재

### 7-1. 목적

생성된 주간 리포트를 하루루 챗봇이 나중에 검색할 수 있도록 청킹해 `rag_analysis`에 저장. **생성 시에는 RAG 사용 X · 저장 후에만 적재.**

### 7-2. 청킹 전략 (1 리포트 = 9 chunks)

| chunk_index | 내용                               | scope.section                   |
| ----------- | ---------------------------------- | ------------------------------- |
| 0           | 전체 요약 (헤드라인 + 주의 + 차주) | `summary`                       |
| 1           | § 1. 주문                          | `orders`                        |
| 2           | § 2 or 2'. 시즌 / 비시즌           | `hotpack_season` or `offseason` |
| 3           | § 3. 총재고                        | `inventory`                     |
| 4           | § 4. 수입 리드타임                 | `import_leadtime`               |
| 5           | § 5. 밀크런                        | `milkrun`                       |
| 6           | § 6. 외부 신호                     | `external`                      |
| 7           | § 7. 납품 미준수                   | `noncompliance`                 |
| 8           | 2부 인사이트                       | `insight`                       |

### 7-3. 적재 함수

```sql
create or replace function public.upsert_weekly_brief_chunks(p_report_id uuid)
returns int language plpgsql as $$
declare
  v_report record;
  v_body jsonb;
  v_count int := 0;
  v_sections text[] := array[
    'orders','hotpack_season','offseason','inventory',
    'import_leadtime','milkrun','external','noncompliance'
  ];
  v_section_idx int[] := array[1,2,2,3,4,5,6,7];
  v_i int;
begin
  select id, season, body_md, generated_at, prompt_hash
    into v_report
  from hotpack_llm_reports
  where id = p_report_id and kind = 'weekly_brief';

  if not found then
    raise exception 'weekly_brief % not found', p_report_id;
  end if;

  v_body := v_report.body_md::jsonb;

  -- chunk 0: 요약
  insert into rag_analysis
    (source_table, source_pk, scope, title, content,
     chunk_index, chunk_total, created_at, updated_at)
  values (
    'hotpack_llm_reports',
    jsonb_build_object('id', v_report.id::text, 'chunk', 'summary'),
    jsonb_build_object(
      'kind', 'weekly_brief',
      'section', 'summary',
      'week_start', v_body->'metadata'->>'week_start',
      'axis', 'both'
    ),
    format('[주간 요약] %s', v_body->'metadata'->>'week_start'),
    format(E'헤드라인\n%s\n\n주의사항\n%s\n\n차주 주목\n%s',
      v_body->'insight'->>'headline',
      v_body->'insight'->'alerts'::text,
      v_body->'insight'->'next_week'::text
    ),
    0, 9, v_report.generated_at, now()
  )
  on conflict (source_table, source_pk, chunk_index) do update
    set content = excluded.content, scope = excluded.scope,
        embedding = null, updated_at = now();
  v_count := v_count + 1;

  -- chunks 1~7
  for v_i in 1..array_length(v_sections, 1) loop
    if v_body->'sections' ? v_sections[v_i] then
      insert into rag_analysis
        (source_table, source_pk, scope, title, content,
         chunk_index, chunk_total, created_at, updated_at)
      values (
        'hotpack_llm_reports',
        jsonb_build_object('id', v_report.id::text, 'chunk', v_sections[v_i]),
        jsonb_build_object(
          'kind', 'weekly_brief',
          'section', v_sections[v_i],
          'week_start', v_body->'metadata'->>'week_start'
        ),
        format('[주간 %s] %s', v_sections[v_i], v_body->'metadata'->>'week_start'),
        v_body->'sections'->>v_sections[v_i],
        v_section_idx[v_i], 9, v_report.generated_at, now()
      )
      on conflict (source_table, source_pk, chunk_index) do update
        set content = excluded.content, scope = excluded.scope,
            embedding = null, updated_at = now();
      v_count := v_count + 1;
    end if;
  end loop;

  -- chunk 8: 인사이트
  insert into rag_analysis
    (source_table, source_pk, scope, title, content,
     chunk_index, chunk_total, created_at, updated_at)
  values (
    'hotpack_llm_reports',
    jsonb_build_object('id', v_report.id::text, 'chunk', 'insight'),
    jsonb_build_object(
      'kind', 'weekly_brief',
      'section', 'insight',
      'week_start', v_body->'metadata'->>'week_start',
      'axis', 'both'
    ),
    format('[주간 인사이트] %s', v_body->'metadata'->>'week_start'),
    v_body->'insight'::text,
    8, 9, v_report.generated_at, now()
  )
  on conflict (source_table, source_pk, chunk_index) do update
    set content = excluded.content, scope = excluded.scope,
        embedding = null, updated_at = now();
  v_count := v_count + 1;

  return v_count;
end $$;
```

> 임베딩 충전은 기존 `rag-embed-missing` cron(10분 주기)이 자동 처리.

---

## 8. Edge Functions

### 8-1. 구조

```
supabase/functions/
├── generate-weekly-brief/    🆕 리포트 생성
├── generate-weekly-audio/    🆕 Supertone TTS
└── transcribe-audio/         🆕 Whisper STT
```

### 8-2. `generate-weekly-brief/index.ts`

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { week_start: requestedWeek, force = false } = await req.json().catch(() => ({}));

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")!;

    // 1. Gate
    const { data: gate } = await sb.rpc("can_generate_weekly_brief");
    if (!gate.allowed && !force) {
      return Response.json(
        { ok: false, error: gate.reason, gate },
        { status: 429, headers: corsHeaders }
      );
    }

    // 2. 주차 계산 (지난주 월~일)
    const weekStart = requestedWeek ?? getLastMonday7DaysAgo();
    const weekEnd = addDays(weekStart, 6);

    // 3. 템플릿
    const { data: template } = await sb.rpc("get_current_report_template");
    const isHotpackSeason = template === "hotpack_season";

    // 4. 7개 섹션 병렬 실행
    const [orders, sectionTwo, inventory, importLt, milkrun, external, noncompliance] =
      await Promise.all([
        sqlOrdersSection(sb, weekStart, weekEnd),
        isHotpackSeason
          ? sqlHotpackSeasonSection(sb, weekStart, weekEnd)
          : sqlOffseasonSection(sb, weekStart, weekEnd),
        sqlInventorySection(sb, weekStart, weekEnd),
        sqlImportLeadtimeSection(sb, weekStart, weekEnd),
        sqlMilkrunSection(sb, weekStart, weekEnd),
        sqlExternalSection(sb, weekStart, weekEnd),
        sqlNoncomplianceSection(sb, weekStart, weekEnd),
      ]);

    // 5. 최근 4주 주간 리포트 요약 (2부 인사이트용 컨텍스트)
    const { data: recentReports } = await sb
      .from("hotpack_llm_reports")
      .select("generated_at, body_md")
      .eq("kind", "weekly_brief")
      .order("generated_at", { ascending: false })
      .limit(4);

    // 6. prompt_hash로 중복 생성 방지
    const promptHash = await sha256(
      JSON.stringify({
        weekStart,
        orders,
        sectionTwo,
        inventory,
        importLt,
        milkrun,
        external,
        noncompliance,
      })
    );
    const { data: cached } = await sb
      .from("hotpack_llm_reports")
      .select("*")
      .eq("kind", "weekly_brief")
      .eq("prompt_hash", promptHash)
      .maybeSingle();
    if (cached && !force) {
      return Response.json({ ok: true, cached: true, report: cached }, { headers: corsHeaders });
    }

    // 7. Claude 호출 (시스템 프롬프트 + 수치)
    const prompt = buildWeeklyBriefPrompt({
      weekStart,
      weekEnd,
      isHotpackSeason,
      sections: { orders, sectionTwo, inventory, importLt, milkrun, external, noncompliance },
      recentReports: recentReports?.map((r) => extractSummaryOnly(r.body_md)) ?? [],
    });

    const claudeRes = await callClaude({
      model: "claude-sonnet-4-6",
      apiKey: anthropicKey,
      prompt,
      maxTokens: 4000,
    });
    const parsed = JSON.parse(extractJson(claudeRes));

    // 8. 저장
    const { data: seasonRow } = await sb
      .from("season_config")
      .select("season")
      .eq("is_closed", false)
      .maybeSingle();
    const season = seasonRow?.season ?? `비시즌-${new Date().getFullYear()}`;

    const { data: inserted, error: ie } = await sb
      .from("hotpack_llm_reports")
      .insert({
        season,
        kind: "weekly_brief",
        body_md: JSON.stringify(parsed),
        prompt_hash: promptHash,
        model: "claude-sonnet-4-6",
      })
      .select()
      .single();
    if (ie) throw new Error(`insert: ${ie.message}`);

    // 9. RAG 청킹 자동 적재
    await sb.rpc("upsert_weekly_brief_chunks", { p_report_id: inserted.id });

    return Response.json(
      {
        ok: true,
        cached: false,
        report: inserted,
        parsed,
        gate,
      },
      { headers: corsHeaders }
    );
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500, headers: corsHeaders }
    );
  }
});

// 헬퍼 함수는 별도 모듈로 분리 추천:
// - sql*Section: 섹션별 SQL 실행
// - buildWeeklyBriefPrompt: 시스템 프롬프트 + user 메시지 빌드
// - extractSummaryOnly: 과거 리포트에서 요약만 추출
// - getLastMonday7DaysAgo, addDays, sha256, extractJson, callClaude: 공용 유틸
```

### 8-3. `generate-weekly-audio/index.ts` (Supertone TTS)

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const VOICE_ID = "supertone:ko-neutral-formal"; // 공식 톤에 맞는 보이스로 교체
const corsHeaders = {
  /* ... */
};

function stripForTts(text: string): string {
  return text
    .replace(/\[ref:[^\]]+\]/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\|/g, ", ")
    .replace(/-{3,}/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { report_id, section = "insight" } = await req.json();
    // section: 'insight' | 'all' | 'orders' | 'hotpack_season' | ...

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const supertoneKey = Deno.env.get("SUPERTONE_API_KEY")!;

    const { data: report } = await sb
      .from("hotpack_llm_reports")
      .select("*")
      .eq("id", report_id)
      .eq("kind", "weekly_brief")
      .single();
    const body = JSON.parse(report.body_md);

    let text: string;
    if (section === "insight") {
      text =
        `이번 주 종합 인사이트입니다. ${body.insight.headline}. ${body.insight.body} ` +
        `주의사항 ${body.insight.alerts.length}건. ${body.insight.alerts.join(". ")} ` +
        `차주 주목 사항은 ${body.insight.next_week.join(", ")} 입니다.`;
    } else if (section === "all") {
      text =
        Object.values(body.sections).join("\n\n") +
        `\n\n종합 인사이트. ${body.insight.headline}. ${body.insight.body}`;
    } else {
      text = body.sections[section] ?? "";
    }
    text = stripForTts(text);

    if (text.length < 10) {
      return Response.json(
        { ok: false, error: "변환할 내용이 부족합니다" },
        { status: 400, headers: corsHeaders }
      );
    }

    // 캐시 확인 (같은 report+section은 재생성 안 함)
    const cachePath = `weekly-brief/${report_id}/${section}.wav`;
    const { data: existing } = await sb.storage
      .from("haruru-audio")
      .list(`weekly-brief/${report_id}`, { limit: 100, search: `${section}.wav` });
    if (existing && existing.length > 0) {
      const { data: url } = sb.storage.from("haruru-audio").getPublicUrl(cachePath);
      return Response.json(
        { ok: true, cached: true, audio_url: url.publicUrl, section },
        { headers: corsHeaders }
      );
    }

    // Supertone 호출
    const res = await fetch(`https://supertoneapi.com/v1/text-to-speech/${VOICE_ID}`, {
      method: "POST",
      headers: {
        "x-sup-api-key": supertoneKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        text,
        language: "ko",
        style: "neutral",
        model: "sona_speech_1",
        voice_settings: { pitch_shift: 0, pitch_variance: 1, speed: 1.0 },
        output_format: "wav",
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Supertone ${res.status}: ${t.slice(0, 400)}`);
    }

    const blob = await res.blob();
    const { error: upErr } = await sb.storage
      .from("haruru-audio")
      .upload(cachePath, blob, { contentType: "audio/wav", upsert: true });
    if (upErr) throw new Error(`storage: ${upErr.message}`);

    const { data: url } = sb.storage.from("haruru-audio").getPublicUrl(cachePath);

    return Response.json(
      {
        ok: true,
        cached: false,
        audio_url: url.publicUrl,
        section,
        text_length: text.length,
      },
      { headers: corsHeaders }
    );
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500, headers: corsHeaders }
    );
  }
});
```

### 8-4. `transcribe-audio/index.ts` (Whisper STT)

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  /* ... */
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const openaiKey = Deno.env.get("OPENAI_API_KEY")!;
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return Response.json(
        { ok: false, error: "file 누락" },
        { status: 400, headers: corsHeaders }
      );
    }

    const whisperForm = new FormData();
    whisperForm.append("file", file);
    whisperForm.append("model", "whisper-1");
    whisperForm.append("language", "ko");
    whisperForm.append("response_format", "json");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: whisperForm,
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Whisper ${res.status}: ${t.slice(0, 400)}`);
    }

    const { text } = await res.json();

    // ⚠️ 요구사항: 사용자 음성 파일은 절대 저장 안 함. 텍스트만 반환.
    return Response.json({ ok: true, text }, { headers: corsHeaders });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500, headers: corsHeaders }
    );
  }
});
```

---

## 9. 프롬프트 설계

### 9-1. 시스템 프롬프트

```
당신은 지엘(GL) 하루온 브랜드의 주간 운영 리포트 작성자입니다.
제공된 SQL 수치와 최근 4주 요약 컨텍스트를 바탕으로 공식 사내 보고서
형식의 주간 리포트를 작성합니다.

# 톤 · 문체
- 경어체·격식체 ("확인되었습니다", "예상됩니다")
- 이모지 사용 금지 (헤더의 §, · 기호 제외)
- 3인칭 객관적 보고 ("하루루가~" 같은 페르소나 금지)
- 추측 어휘 금지 ("~같아요", "아마도" 금지)

# 구성
1부 · 파트별 사실 보고
  - 제공된 SQL 결과를 한국어 서술문으로 전개
  - 수치 뒤에 [ref:sql.섹션.row_N] 태그 부착
  - 섹션별 독립된 마크다운 블록으로 작성

2부 · 종합 인사이트
  - 1부 수치 + 최근 4주 요약 컨텍스트 기반
  - 단순 수치 나열 금지. 인과/패턴/비교 중심
  - 헤드라인 1줄 → 본문 3~5문장 → 주의사항 3건 → 차주 주목 3건

# 절대 준수
- 쿠팡 축 / ERP 축 합산 금지
- orders 매출 기본 필터: status='approved' AND is_internal=false
- status별 분리 표시 (합치지 않음)
- 추측/일반론 없이 제공 수치만 사용

# 출력 형식
아래 JSON 형식만 출력. 마크다운 펜스 · 설명 문구 추가 금지.

{
  "metadata": {
    "week_start": "YYYY-MM-DD",
    "week_end":   "YYYY-MM-DD",
    "template":   "hotpack_season" | "off_season"
  },
  "sections": {
    "orders":          "§ 1 전체 텍스트",
    "hotpack_season":  "§ 2 (시즌 중) 또는",
    "offseason":       "§ 2' (비시즌)",
    "inventory":       "§ 3 전체 텍스트",
    "import_leadtime": "§ 4 전체 텍스트",
    "milkrun":         "§ 5 전체 텍스트",
    "external":        "§ 6 전체 텍스트",
    "noncompliance":   "§ 7 전체 텍스트"
  },
  "insight": {
    "headline":  "한 줄 요약",
    "body":      "3~5 문장 인사이트",
    "alerts":    ["주의 1", "주의 2", "주의 3"],
    "next_week": ["차주 주목 1", "2", "3"]
  }
}
```

### 9-2. User 메시지 구성

```
# 대상 주차
${weekStart} ~ ${weekEnd}
템플릿: ${template}

# SQL 결과 (섹션별)
## § 1 주문
${JSON.stringify(orders.rows)}

## § 2 시즌 분석 (or 비시즌)
${JSON.stringify(sectionTwo.rows)}

... (§ 3 ~ § 7 동일)

# 최근 4주 주간 리포트 요약 (참고 컨텍스트)
[W46] ${recentReports[0]?.headline} / ${recentReports[0]?.body}
[W45] ...
[W44] ...
[W43] ...

위 컨텍스트만 사용하여 주간 리포트 JSON을 출력하세요.
```

---

## 10. 비용·성능 추정

| 항목                                        | 1회 생성 시              |
| ------------------------------------------- | ------------------------ |
| Claude Sonnet 4.6 (input ~12K · output ~3K) | 약 $0.08                 |
| Supertone TTS (인사이트 ~500자)             | Supertone 체계 확인 필요 |
| OpenAI 임베딩 (9 chunk × 평균 500 토큰)     | 약 $0.0001               |
| Whisper STT (사용자 10초)                   | 약 $0.001                |

**월 8회 생성 × 사용자 10명 재생** 가정 시 **월 $5~10**.

**응답 시간**:

- SQL 병렬 7개: 2~4초
- Claude 호출: 10~18초 (output 3K)
- 저장 + 청킹 적재: 1초
- **총 15~25초** → 프론트엔드 진행 표시 필수

---

## 11. 리스크 & 완화

| Risk                  | 완화                                                            |
| --------------------- | --------------------------------------------------------------- |
| Claude JSON 파싱 실패 | `extractJson()` fallback + 1회 재시도                           |
| Supertone 실패        | 30초 타임아웃 · 실패 시 텍스트만 표시 · 재생성 버튼             |
| Whisper 오인식        | 변환 텍스트를 입력창에 먼저 표시 → 사용자 확인 후 전송          |
| 월/금 외 생성 시도    | `can_generate_weekly_brief` 가드로 429 반환                     |
| 비시즌 § 2' 0행       | "본 주 해당 카테고리 거래 없음" 문구, 리포트는 정상 생성        |
| 임베딩 반영 지연      | 생성 직후 10분 안내 문구                                        |
| Storage 누적          | 리포트당 9섹션 × 2MB ≈ 18MB. 월 8건 = 144MB. 6개월 cleanup cron |

### 11-1. 음성 Storage 정리

```sql
select cron.schedule(
  'haruru-audio-cleanup',
  '0 3 1 * *',     -- 매월 1일 03:00
  $$ delete from storage.objects
     where bucket_id = 'haruru-audio'
       and created_at < now() - interval '6 months'; $$
);
```

---

## 12. 배포 체크리스트 (백엔드)

### DB

- [ ] `hotpack_llm_reports.kind` CHECK에 `weekly_brief` 추가
- [ ] `can_generate_weekly_brief()` 함수 생성 (월/금 가드)
- [ ] `get_current_report_template()` 함수 생성
- [ ] `upsert_weekly_brief_chunks(uuid)` 함수 생성

### Edge Functions

- [ ] `generate-weekly-brief` 배포
- [ ] `generate-weekly-audio` 배포
- [ ] `transcribe-audio` 배포

### Secrets

- [ ] `SUPERTONE_API_KEY` 신규 등록
- [ ] `OPENAI_API_KEY` 확인 (기존 `rag-embed-missing`에서 사용 중)
- [ ] `ANTHROPIC_API_KEY` 확인 (기존 `haruru-agent` v8에서 사용 중)

### Storage

- [ ] `haruru-audio` 버킷 생성 (public read, service_role write)
- [ ] 6개월 cleanup cron 등록

### 검증

- [ ] 월요일·금요일에만 생성 가능, 그 외 429
- [ ] 주 2회 한도 초과 시 429
- [ ] 비시즌 템플릿 분기 동작
- [ ] 생성 리포트가 RAG에 9 chunk 적재됨
- [ ] Supertone TTS WAV 생성·Storage 업로드 OK
- [ ] Whisper STT 한국어 정확도 수용 가능
- [ ] **사용자 음성 파일이 Storage·DB에 남지 않음** (필수 요구)
- [ ] 공식 톤이 체감적으로 유지됨 (수동 검토)

---

## 13. Phase 2 확장

- 수요일 추가 생성 허용
- 섹션별 개별 재생성
- `gpt-4o-transcribe`로 STT 교체 (정확도 향상)
- 리포트 이메일 자동 발송
- 섹션별 TTS 사전 캐싱
- RAG 검색 기반 과거 주차 대비 비교 강화

---

## 14. 변경 이력

| 버전 | 날짜       | 내용                                                                                                                                                                                                                                                                                                                                              |
| ---- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v0.1 | 2026-04-22 | 초안                                                                                                                                                                                                                                                                                                                                              |
| v0.2 | 2026-04-22 | 프론트엔드 섹션 07 문서로 분리                                                                                                                                                                                                                                                                                                                    |
| v0.3 | 2026-04-23 | **재작성**. 생성 시 RAG 검색 제거 → 시스템 프롬프트 + SQL만. 저장 후에만 RAG 청킹 적재. 공식 사내 보고서 톤 확정. 주 2회 월·금. 기존 대시보드 뷰 재사용(`v_orders_summary`, `v_hotpack_season_daily`, `v_current_stock`, `v_weather_hybrid`, `v_keyword_daily_with_ma`). § 4·5·7은 직접 쿼리. Edge Function 3개, 하루루 에이전트는 건드리지 않음. |
