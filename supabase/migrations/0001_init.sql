-- Esquema inicial: tiendas cercanas, productos por cadena e historial de precios.
-- Los precios de Kassalapp vienen por CADENA (no por tienda física).

create table if not exists physical_stores (
  id          bigint primary key,            -- id de Kassalapp
  chain       text not null,                 -- REMA_1000 | KIWI | COOP_EXTRA
  name        text not null,
  address     text,
  lat         double precision,
  lng         double precision,
  updated_at  timestamptz not null default now()
);

create table if not exists items (
  id                  bigint primary key,    -- id de producto de Kassalapp
  chain               text not null,         -- REMA_1000 | KIWI | COOP_NO
  ean                 text,
  name                text not null,
  brand               text,
  vendor              text,
  category            text,
  image               text,
  url                 text,
  weight              numeric,
  weight_unit         text,
  current_price       numeric,
  current_unit_price  numeric,
  price_updated_at    timestamptz,
  updated_at          timestamptz not null default now()
);
create index if not exists items_ean_idx   on items (ean);
create index if not exists items_chain_idx on items (chain);
create index if not exists items_name_idx  on items using gin (to_tsvector('simple', name));

-- Una fila cada vez que el precio cambia (o la primera vez que lo vemos).
create table if not exists price_history (
  id           bigint generated always as identity primary key,
  item_id      bigint not null references items(id) on delete cascade,
  price        numeric not null,
  unit_price   numeric,
  observed_at  timestamptz not null default now()
);
create index if not exists price_history_item_idx on price_history (item_id, observed_at desc);

-- Productos que quieres vigilar: la sincronización busca cada término en cada cadena.
create table if not exists tracked_terms (
  term        text primary key,
  created_at  timestamptz not null default now()
);

create table if not exists sync_runs (
  id           bigint generated always as identity primary key,
  term         text,
  chain        text,
  items_seen   int not null default 0,
  price_changes int not null default 0,
  error        text,
  ran_at       timestamptz not null default now()
);

-- Solo el servidor (service role) accede a los datos: RLS activo y sin políticas públicas.
alter table physical_stores enable row level security;
alter table items           enable row level security;
alter table price_history   enable row level security;
alter table tracked_terms   enable row level security;
alter table sync_runs       enable row level security;
