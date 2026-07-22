-- Company registration + password login (CMP-XXXXXX). Does not touch attendance.

alter table public.companies
  add column if not exists login_id text,
  add column if not exists password_hash text,
  add column if not exists owner_name text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists active boolean not null default true;

create unique index if not exists companies_login_id_unique
  on public.companies (upper(login_id))
  where login_id is not null;

create unique index if not exists companies_email_unique
  on public.companies (lower(email))
  where email is not null;

comment on column public.companies.login_id is 'Company login ID shown to managers, format CMP-XXXXXX.';
comment on column public.companies.password_hash is 'scrypt password hash for Company Admin login.';
comment on column public.companies.active is 'When false, company cannot sign in.';
