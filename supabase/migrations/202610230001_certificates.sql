create extension if not exists pgcrypto;
create table if not exists public.certificates (
 id uuid primary key default gen_random_uuid(),
 code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
 course_title text not null check (char_length(course_title) between 1 and 120),
 workload_hours integer not null check (workload_hours between 1 and 1000),
 issued_on date not null,
 status text not null default 'valid' check (status in ('valid','revoked')),
 created_at timestamptz not null default now(),
 revoked_at timestamptz
);
create table if not exists public.issuance_admins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table public.certificates enable row level security;
alter table public.issuance_admins enable row level security;
revoke all on public.certificates from anon, authenticated;
revoke all on public.issuance_admins from anon, authenticated;
comment on table public.certificates is 'Registros mínimos de validação; sem nomes de alunos ou códigos brutos.';
comment on column public.certificates.code_hash is 'SHA-256 do código aleatório entregue ao operador no navegador.';
