-- Usuarios con contraseña (hash scrypt con sal) y registro de intentos de acceso.
-- Requiere 0001 y 0002. El usuario se crea aparte con `npm run user:sql -- <usuario> <contraseña>`
-- (la contraseña/hash NO se guarda en el repositorio).

create table if not exists app_users (
  id             bigint generated always as identity primary key,
  username       text not null unique check (username ~ '^[a-z0-9._-]{3,50}$'),
  password_hash  text not null,
  created_at     timestamptz not null default now(),
  last_login     timestamptz
);

create table if not exists login_attempts (
  id        bigint generated always as identity primary key,
  username  text,
  ip        text,
  ok        boolean not null,
  at        timestamptz not null default now()
);
create index if not exists login_attempts_at_idx on login_attempts (at desc);

-- Solo el servidor (service role) accede a estas tablas.
alter table app_users      enable row level security;
alter table login_attempts enable row level security;
