-- 1) items
create table if not exists public.items (
  id bigserial primary key,
  seq_no integer not null default 0,
  item_name text not null,
  manufacture_year text null,
  production_type text null, -- 수입/제품/상품
  erp_code text null,
  coupang_sku_id text null,
  cost_price numeric(12,2) null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_items_seq_no on public.items(seq_no);
create index if not exists idx_items_erp_code on public.items(erp_code);
create index if not exists idx_items_active on public.items(is_active);

-- 2) transactions
create table if not exists public.transactions (
  id bigserial primary key,
  item_id bigint not null references public.items(id) on delete cascade,
  tx_date date not null,
  tx_type text not null, -- IN_IMPORT, OUT_ORDER ...
  qty integer not null default 0,
  counterparty text null,
  note text null,
  unit_price numeric(12,2) null,
  source text null default 'manual', -- erp_crawl/manual/excel_import
  erp_synced boolean null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_transactions_item_date on public.transactions(item_id, tx_date);
create index if not exists idx_transactions_type on public.transactions(tx_type);

-- 3) inventory_snapshots (현재 훅 에러 방지용 최소)
create table if not exists public.inventory_snapshots (
  id bigserial primary key,
  item_id bigint not null references public.items(id) on delete cascade,
  physical_qty integer not null default 0,
  erp_qty integer null,
  snapshot_at timestamptz not null default now()
);

create index if not exists idx_snapshots_item_time on public.inventory_snapshots(item_id, snapshot_at desc);

-- 4) scheduled_transactions (현재 훅 에러 방지용 최소)
create table if not exists public.scheduled_transactions (
  id bigserial primary key,
  item_id bigint not null references public.items(id) on delete cascade,
  scheduled_date date not null,
  tx_type text not null,
  qty integer not null default 0,
  status text not null default 'pending', -- pending/confirmed/done/cancelled
  counterparty text null,
  note text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_scheduled_item_date on public.scheduled_transactions(item_id, scheduled_date);
create index if not exists idx_scheduled_status on public.scheduled_transactions(status);