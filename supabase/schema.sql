-- =====================================================================
-- WineBar POS — Supabase (Postgres) schema
-- Mirrors the Dexie (IndexedDB) stores in src/db/database.ts
-- Run in: Supabase Dashboard -> SQL Editor. Safe to re-run (idempotent).
--
-- Conventions (match the app):
--   * IDs are TEXT  (app uses ids like 'cat-whisky' and crypto.randomUUID())
--   * Money is stored in PAISE as BIGINT (app does amount * 100)
--   * Timestamps are timestamptz (app sends ISO strings)
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- helper: keep updated_at fresh ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- users ----------
create table if not exists public.users (
  id          text primary key,
  name        text not null,
  username    text not null unique,
  role        text not null check (role in ('ADMIN','MANAGER','CASHIER','INVENTORY_STAFF')),
  active      boolean not null default true,
  pin_hash    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- categories ----------
create table if not exists public.categories (
  id          text primary key,
  name        text not null,
  icon        text not null default '',
  color       text not null default '#64748b',
  sort_order  integer not null default 0,
  active      boolean not null default true
);

-- ---------- products ----------
create table if not exists public.products (
  id              text primary key,
  name            text not null,
  brand           text not null default '',
  category_id     text references public.categories(id) on update cascade on delete set null,
  bottle_size     text not null default '',
  barcode         text not null default '',
  sku             text not null default '',
  purchase_price  bigint  not null default 0 check (purchase_price >= 0),
  selling_price   bigint  not null default 0 check (selling_price  >= 0),
  mrp             bigint  not null default 0 check (mrp            >= 0),
  tax_rate        numeric(5,2) not null default 0,
  opening_stock   integer not null default 0,
  current_stock   integer not null default 0,
  minimum_stock   integer not null default 0,
  image           text,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists products_category_idx on public.products(category_id);
create index if not exists products_name_idx     on public.products(name);
create index if not exists products_brand_idx    on public.products(brand);
-- Barcode/SKU unique only when filled in (app allows empty strings)
create index if not exists products_barcode_idx on public.products(barcode);
create index if not exists products_sku_idx     on public.products(sku);

drop trigger if exists products_updated_at on public.products;
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

-- ---------- sales ----------
create table if not exists public.sales (
  id               text primary key,
  idempotency_key  text not null unique,          -- makes sync retries safe
  invoice_number   text not null unique,
  cashier_id       text,
  cashier_name     text not null default '',
  created_at       timestamptz not null default now(),
  subtotal         bigint not null default 0,
  discount         bigint not null default 0,
  tax              bigint not null default 0,
  total            bigint not null default 0,
  cash_received    bigint not null default 0,
  change_returned  bigint not null default 0,
  server_received_at timestamptz not null default now()
);
create index if not exists sales_created_at_idx on public.sales(created_at);
create index if not exists sales_cashier_idx    on public.sales(cashier_id);

-- ---------- sale_items ----------
create table if not exists public.sale_items (
  id              text primary key,
  sale_id         text not null references public.sales(id) on delete cascade,
  product_id      text references public.products(id) on update cascade on delete set null,
  product_name    text not null,
  bottle_size     text not null default '',
  quantity        integer not null check (quantity > 0),
  unit_price      bigint  not null default 0,
  purchase_price  bigint  not null default 0,
  discount        bigint  not null default 0,
  tax             bigint  not null default 0,
  total           bigint  not null default 0
);
create index if not exists sale_items_sale_idx    on public.sale_items(sale_id);
create index if not exists sale_items_product_idx on public.sale_items(product_id);

-- ---------- sale_payments (Sale.payments[]) ----------
create table if not exists public.sale_payments (
  id        text primary key,
  sale_id   text not null references public.sales(id) on delete cascade,
  method    text not null check (method in ('CASH','UPI','CARD','OTHER')),
  amount    bigint not null check (amount >= 0)
);
create index if not exists sale_payments_sale_idx on public.sale_payments(sale_id);

-- ---------- purchases ----------
create table if not exists public.purchases (
  id             text primary key,
  reference      text not null unique,
  created_at     timestamptz not null default now(),
  supplier_note  text,
  total          bigint not null default 0,
  user_id        text
);
create index if not exists purchases_created_at_idx on public.purchases(created_at);

create table if not exists public.purchase_items (
  id             text primary key,
  purchase_id    text not null references public.purchases(id) on delete cascade,
  product_id     text references public.products(id) on update cascade on delete set null,
  product_name   text not null,
  bottle_size    text not null default '',
  quantity       integer not null check (quantity > 0),
  purchase_rate  bigint  not null default 0,
  batch_number   text
);
create index if not exists purchase_items_purchase_idx on public.purchase_items(purchase_id);

-- ---------- inventory_transactions (stock ledger) ----------
create table if not exists public.inventory_transactions (
  id            text primary key,
  reference     text not null,
  product_id    text references public.products(id) on update cascade on delete set null,
  product_name  text not null,
  type          text not null check (type in
                 ('OPENING_STOCK','PURCHASE_IN','SALE_OUT','ADJUSTMENT_IN','ADJUSTMENT_OUT','DAMAGE','EXPIRED')),
  stock_in      integer not null default 0,
  stock_out     integer not null default 0,
  balance       integer not null default 0,
  reason        text,
  user_id       text,
  created_at    timestamptz not null default now()
);
create index if not exists inv_tx_product_idx    on public.inventory_transactions(product_id);
create index if not exists inv_tx_type_idx       on public.inventory_transactions(type);
create index if not exists inv_tx_created_at_idx on public.inventory_transactions(created_at);

-- ---------- expenses ----------
create table if not exists public.expenses (
  id              text primary key,
  title           text not null,
  category        text not null default 'Other operating expenses',
  amount          bigint not null check (amount >= 0),
  date            date not null,
  payment_method  text not null default 'CASH' check (payment_method in ('CASH','UPI','CARD','OTHER')),
  description     text not null default '',
  user_id         text,
  created_at      timestamptz not null default now()
);
create index if not exists expenses_date_idx on public.expenses(date);

-- ---------- settlements (daily close) ----------
create table if not exists public.settlements (
  id             text primary key,
  business_date  date not null,
  opening_cash   bigint not null default 0,
  cash_sales     bigint not null default 0,
  upi_sales      bigint not null default 0,
  card_sales     bigint not null default 0,
  other_sales    bigint not null default 0,
  cash_expenses  bigint not null default 0,
  expected_cash  bigint not null default 0,
  actual_cash    bigint not null default 0,
  shortage       bigint not null default 0,
  excess         bigint not null default 0,
  total_bills    integer not null default 0,
  bottles_sold   integer not null default 0,
  status         text not null default 'open' check (status in ('open','closed')),
  closed_by      text,
  closed_at      timestamptz
);
create index if not exists settlements_date_idx on public.settlements(business_date);


-- ---------- audit_logs ----------
create table if not exists public.audit_logs (
  id           text primary key,
  action       text not null,
  entity_type  text,
  entity_id    text,
  user_id      text,
  details      text,
  created_at   timestamptz not null default now()
);
create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at);
create index if not exists audit_logs_entity_idx     on public.audit_logs(entity_type, entity_id);

-- ---------- settings (key/value; replaces Dexie `settings`) ----------
-- 'shop' row: shopName, address, phone, gst, businessBoundaryHour, timezone
create table if not exists public.settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
drop trigger if exists settings_updated_at on public.settings;
create trigger settings_updated_at before update on public.settings
  for each row execute function public.set_updated_at();

-- ---------- compatibility: relax constraints from the first version of this script ----------
-- The device (IndexedDB) is the source of truth and local users are not stored in Supabase,
-- so these server-side constraints would only make syncs fail.
alter table public.sales                  drop constraint if exists sales_cashier_id_fkey;
alter table public.purchases              drop constraint if exists purchases_user_id_fkey;
alter table public.inventory_transactions drop constraint if exists inventory_transactions_user_id_fkey;
alter table public.expenses               drop constraint if exists expenses_user_id_fkey;
alter table public.settlements            drop constraint if exists settlements_closed_by_fkey;
alter table public.categories             drop constraint if exists categories_name_key;
drop index if exists public.products_barcode_uq;
drop index if exists public.products_sku_uq;
drop index if exists public.settlements_closed_day_uq;

-- =====================================================================
-- Idempotent sale sync: one call stores sale + items + payments.
-- Safe to retry — a repeated idempotency_key is ignored.
-- Does NOT touch stock (the app already writes SALE_OUT ledger rows).
-- Expected payload = the Sale object from the app, plus an "items" array
-- of SaleItem objects (camelCase, same as src/types/models.ts).
-- =====================================================================
create or replace function public.sync_sale(payload jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text := payload->>'id';
  v_inserted int;
begin
  insert into public.sales (
    id, idempotency_key, invoice_number, cashier_id, cashier_name, created_at,
    subtotal, discount, tax, total, cash_received, change_returned
  ) values (
    v_id,
    payload->>'idempotencyKey',
    payload->>'invoiceNumber',
    nullif(payload->>'cashierId',''),
    coalesce(payload->>'cashierName',''),
    (payload->>'createdAt')::timestamptz,
    coalesce((payload->>'subtotal')::bigint,0),
    coalesce((payload->>'discount')::bigint,0),
    coalesce((payload->>'tax')::bigint,0),
    coalesce((payload->>'total')::bigint,0),
    coalesce((payload->>'cashReceived')::bigint,0),
    coalesce((payload->>'changeReturned')::bigint,0)
  )
  on conflict (idempotency_key) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return 'duplicate';
  end if;

  insert into public.sale_payments (id, sale_id, method, amount)
  select p->>'id', v_id, p->>'method', (p->>'amount')::bigint
  from jsonb_array_elements(coalesce(payload->'payments','[]'::jsonb)) p
  on conflict (id) do nothing;

  insert into public.sale_items (
    id, sale_id, product_id, product_name, bottle_size, quantity,
    unit_price, purchase_price, discount, tax, total
  )
  select i->>'id', v_id,
         (select pr.id from public.products pr where pr.id = i->>'productId'),
         i->>'productName', coalesce(i->>'bottleSize',''),
         (i->>'quantity')::int,
         coalesce((i->>'unitPrice')::bigint,0),
         coalesce((i->>'purchasePrice')::bigint,0),
         coalesce((i->>'discount')::bigint,0),
         coalesce((i->>'tax')::bigint,0),
         coalesce((i->>'total')::bigint,0)
  from jsonb_array_elements(coalesce(payload->'items','[]'::jsonb)) i
  on conflict (id) do nothing;

  return 'inserted';
end $$;

-- Only the server (service_role) may call it
revoke all on function public.sync_sale(jsonb) from public, anon, authenticated;
grant execute on function public.sync_sale(jsonb) to service_role;

-- =====================================================================
-- Row Level Security
-- RLS ON + no policies = anon/authenticated browser keys can read nothing.
-- Your Vercel API routes / Edge Functions use the SERVICE ROLE key,
-- which bypasses RLS. Add policies later if you move to Supabase Auth.
-- =====================================================================
alter table public.users                  enable row level security;
alter table public.categories             enable row level security;
alter table public.products               enable row level security;
alter table public.sales                  enable row level security;
alter table public.sale_items             enable row level security;
alter table public.sale_payments          enable row level security;
alter table public.purchases              enable row level security;
alter table public.purchase_items         enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.expenses               enable row level security;
alter table public.settlements            enable row level security;
alter table public.audit_logs             enable row level security;
alter table public.settings               enable row level security;

-- =====================================================================
-- Seed data: default categories + shop settings only (no mock products, no login users)
-- =====================================================================
insert into public.categories (id, name, icon, color, sort_order, active) values
  ('cat-whisky','Whisky','🥃','#a855f7',0,true),
  ('cat-rum','Rum','◆','#f97316',1,true),
  ('cat-vodka','Vodka','◇','#06b6d4',2,true),
  ('cat-beer','Beer','🍺','#eab308',3,true),
  ('cat-wine','Wine','🍷','#ec4899',4,true),
  ('cat-brandy','Brandy','●','#8b5cf6',5,true),
  ('cat-gin','Gin','○','#10b981',6,true),
  ('cat-other','Other','■','#64748b',7,true)
on conflict (id) do nothing;


insert into public.settings (key, value) values
  ('shop', '{"shopName":"WineBar Guwahati","address":"Guwahati, Assam","phone":"","gst":"","businessBoundaryHour":0,"timezone":"Asia/Kolkata"}')
on conflict (key) do nothing;

-- Create your real login users yourself (don't ship default passwords):
-- insert into public.users (id, name, username, role, pin_hash)
-- values ('admin-1','Shop Admin','admin','ADMIN','<sha256-hex-of-pin>');
