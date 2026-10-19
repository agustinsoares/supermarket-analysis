-- Despensa, lista de la compra y recetas. Requiere 0001-0003.

-- Lo que tenemos en casa.
create table if not exists pantry_items (
  id          bigint generated always as identity primary key,
  name        text not null check (length(name) between 1 and 120),
  quantity    numeric check (quantity is null or quantity >= 0),
  unit        text,
  expires_on  date,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Lista de la compra. `item_ref` enlaza con un producto del catálogo para calcular precios por tienda.
create table if not exists shopping_items (
  id          bigint generated always as identity primary key,
  name        text not null check (length(name) between 1 and 160),
  quantity    numeric not null default 1 check (quantity > 0),
  note        text,
  item_ref    bigint references items(id) on delete set null,
  checked     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists shopping_items_checked_idx on shopping_items (checked, created_at);

-- Recetas e ingredientes.
create table if not exists recipes (
  id          bigint generated always as identity primary key,
  title       text not null check (length(title) between 1 and 160),
  servings    int check (servings is null or servings > 0),
  source_url  text,
  steps       text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists recipe_ingredients (
  id          bigint generated always as identity primary key,
  recipe_id   bigint not null references recipes(id) on delete cascade,
  position    int not null default 0,
  name        text not null check (length(name) between 1 and 120),
  quantity    numeric check (quantity is null or quantity >= 0),
  unit        text
);
create index if not exists recipe_ingredients_recipe_idx on recipe_ingredients (recipe_id, position);

-- Solo el servidor (service role) accede a estas tablas.
alter table pantry_items       enable row level security;
alter table shopping_items     enable row level security;
alter table recipes            enable row level security;
alter table recipe_ingredients enable row level security;
