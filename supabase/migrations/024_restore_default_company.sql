-- Restore legacy DEFAULT tenant and link existing shops/staff (idempotent).
-- Does NOT delete or update attendance rows, staff rows, shops, or QR tokens.

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

alter table public.companies
  add column if not exists active boolean not null default true;

alter table public.shops
  add column if not exists company_id uuid references public.companies (id) on delete restrict;

alter table public.staff
  add column if not exists company_id uuid references public.companies (id) on delete restrict;

-- DEFAULT company for all pre-SaaS data
insert into public.companies (
  name,
  code,
  status,
  trial_started_at,
  trial_ends_at,
  subscription_ends_at,
  admin_pin,
  active
)
select
  'Existing Company',
  'DEFAULT',
  'active',
  now(),
  now() + interval '14 days',
  now() + interval '100 years',
  '520123',
  true
where not exists (select 1 from public.companies where upper(code) = 'DEFAULT');

update public.companies
set
  name = 'Existing Company',
  status = 'active',
  active = true,
  subscription_ends_at = coalesce(subscription_ends_at, now() + interval '100 years'),
  admin_pin = coalesce(nullif(trim(admin_pin), ''), '520123'),
  updated_at = now()
where upper(code) = 'DEFAULT';

-- Link shops and staff (only null company_id — never overwrite another tenant)
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

-- Subscription row for DEFAULT (when subscriptions table exists)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'subscriptions'
  ) then
    insert into public.subscriptions (
      company_id,
      status,
      trial_started_at,
      trial_ends_at,
      subscription_ends_at
    )
    select
      c.id,
      'active',
      c.trial_started_at,
      c.trial_ends_at,
      c.subscription_ends_at
    from public.companies c
    where upper(c.code) = 'DEFAULT'
    on conflict (company_id) do update set
      status = 'active',
      subscription_ends_at = excluded.subscription_ends_at,
      updated_at = now();
  end if;
end $$;

comment on table public.companies is 'SaaS tenant; legacy rows use code DEFAULT (Existing Company).';
