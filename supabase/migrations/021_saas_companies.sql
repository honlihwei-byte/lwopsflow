-- SaaS multi-company: tenants, subscription status, backfill existing data (no QR changes).

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null,
  status text not null default 'trial'
    check (status in ('trial', 'active', 'suspended', 'expired')),
  trial_started_at timestamptz not null default now(),
  trial_ends_at timestamptz,
  subscription_ends_at timestamptz,
  admin_pin text not null default '520123',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists companies_code_unique on public.companies (upper(code));

alter table public.shops
  add column if not exists company_id uuid references public.companies (id) on delete restrict;

alter table public.staff
  add column if not exists company_id uuid references public.companies (id) on delete restrict;

create index if not exists shops_company_id_idx on public.shops (company_id);
create index if not exists staff_company_id_idx on public.staff (company_id);

-- Default company for all legacy rows (idempotent).
insert into public.companies (name, code, status, trial_started_at, trial_ends_at, subscription_ends_at, admin_pin)
select
  'Existing Company',
  'DEFAULT',
  'active',
  now(),
  now() + interval '14 days',
  now() + interval '100 years',
  '520123'
where not exists (select 1 from public.companies where upper(code) = 'DEFAULT');

update public.shops s
set company_id = c.id
from public.companies c
where upper(c.code) = 'DEFAULT'
  and s.company_id is null;

update public.staff st
set company_id = s.company_id
from public.staff_shop_assignments ssa
join public.shops s on s.id = ssa.shop_id
where ssa.staff_id = st.id
  and st.company_id is null
  and s.company_id is not null;

update public.staff st
set company_id = c.id
from public.companies c
where upper(c.code) = 'DEFAULT'
  and st.company_id is null;

comment on table public.companies is 'SaaS tenant; shops and staff belong to one company.';
comment on column public.companies.admin_pin is 'Company Admin 6-digit PIN (server-side only).';
