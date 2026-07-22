-- Billing: plans, payments, invoices. Does not touch attendance or QR.

alter table public.subscriptions
  add column if not exists plan_slug text not null default 'trial',
  add column if not exists payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid', 'overdue')),
  add column if not exists max_staff int;

comment on column public.subscriptions.plan_slug is 'starter | business | multi_shop | enterprise | trial';
comment on column public.subscriptions.payment_status is 'pending | paid | overdue';

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  plan_slug text not null,
  amount_cents int not null,
  currency text not null default 'MYR',
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'overdue', 'cancelled')),
  payment_method text not null default 'manual',
  reference_code text,
  notes text,
  due_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_company_id_idx on public.payments (company_id);
create index if not exists payments_status_idx on public.payments (status);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  payment_id uuid references public.payments (id) on delete set null,
  invoice_number text not null,
  plan_slug text not null,
  amount_cents int not null,
  currency text not null default 'MYR',
  status text not null default 'draft'
    check (status in ('draft', 'issued', 'paid', 'void')),
  period_start timestamptz,
  period_end timestamptz,
  issued_at timestamptz not null default now(),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists invoices_number_unique on public.invoices (invoice_number);
create index if not exists invoices_company_id_idx on public.invoices (company_id);

-- Backfill subscription rows from companies
insert into public.subscriptions (
  company_id,
  status,
  trial_started_at,
  trial_ends_at,
  subscription_ends_at,
  plan_slug,
  payment_status
)
select
  c.id,
  c.status,
  c.trial_started_at,
  c.trial_ends_at,
  c.subscription_ends_at,
  case when c.status = 'trial' then 'trial' else 'starter' end,
  case when c.status = 'active' then 'paid' else 'pending' end
from public.companies c
where not exists (select 1 from public.subscriptions s where s.company_id = c.id);

update public.subscriptions s
set
  plan_slug = case when c.status = 'trial' then 'trial' else coalesce(s.plan_slug, 'starter') end,
  payment_status = case
    when c.status = 'active' then 'paid'
    when c.status = 'suspended' then 'overdue'
    else 'pending'
  end
from public.companies c
where s.company_id = c.id;
