-- Productos manuales / de folleto, edición, folletos y almacenamiento de imágenes.
-- Requiere haber ejecutado antes 0001_init.sql.

-- 1) Productos: origen, gramos, estado (borrador/activo), vigencia y notas.
create sequence if not exists items_manual_seq start 10000000000;      -- ids de Kassalapp son < 10^7
alter table items alter column id set default nextval('items_manual_seq');

alter table items add column if not exists source     text    not null default 'kassalapp';
alter table items add column if not exists status     text    not null default 'active';
alter table items add column if not exists grams      numeric;
alter table items add column if not exists valid_from date;
alter table items add column if not exists valid_to   date;
alter table items add column if not exists notes      text;
alter table items add column if not exists flyer_id   bigint;
alter table items add column if not exists locked     boolean not null default false;  -- editado a mano: la sincronización no lo pisa

do $$ begin
  alter table items add constraint items_source_chk check (source in ('kassalapp', 'manual', 'flyer'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table items add constraint items_status_chk check (status in ('active', 'draft'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table items add constraint items_price_chk check (current_price is null or current_price >= 0);
exception when duplicate_object then null; end $$;

create index if not exists items_status_idx on items (status);
create index if not exists items_flyer_idx  on items (flyer_id);

-- 2) Folletos subidos.
create table if not exists flyers (
  id            bigint generated always as identity primary key,
  chain         text not null check (chain in ('REMA_1000', 'KIWI', 'EXTRA')),
  title         text not null,
  valid_from    date,
  valid_to      date,
  files         jsonb not null default '[]'::jsonb,   -- [{ "path": "...", "mime": "...", "name": "..." }]
  status        text not null default 'uploaded'
                check (status in ('uploaded', 'analyzing', 'review', 'done', 'error')),
  plan          jsonb,                                -- unidades de análisis (páginas/imágenes)
  units_total   int  not null default 0,
  units_done    int  not null default 0,
  items_found   int  not null default 0,
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table flyers enable row level security;

do $$ begin
  alter table items add constraint items_flyer_fk foreign key (flyer_id) references flyers(id) on delete set null;
exception when duplicate_object then null; end $$;

-- 3) Almacenamiento: imágenes de producto (públicas) y folletos (privados).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-images', 'product-images', true,  5242880,  array['image/jpeg', 'image/png', 'image/webp']),
  ('flyers',         'flyers',         false, 52428800, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
