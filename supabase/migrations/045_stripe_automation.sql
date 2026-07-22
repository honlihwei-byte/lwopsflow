-- Stripe subscription automation: extended subscription fields + webhook event log

alter table public.subscriptions
  add column if not exists user_id uuid,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_status text,
  add column if not exists current_period_end timestamptz;

comment on column public.subscriptions.user_id is 'Supabase Auth user_id of company owner (when linked)';
comment on column public.subscriptions.stripe_customer_id is 'Stripe Customer id (cus_...)';
comment on column public.subscriptions.stripe_subscription_status is 'Raw Stripe subscription status (active, canceled, etc.)';
comment on column public.subscriptions.current_period_end is 'Stripe current billing period end';
comment on column public.subscriptions.plan_slug is 'trial | free | starter | growth | business';

create index if not exists subscriptions_stripe_customer_id_idx
  on public.subscriptions (stripe_customer_id)
  where stripe_customer_id is not null;

create index if not exists subscriptions_user_id_idx
  on public.subscriptions (user_id)
  where user_id is not null;

-- Stripe webhook audit log (debugging + idempotency)
create table if not exists public.stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  stripe_customer_id text,
  stripe_subscription_id text,
  company_id uuid references public.companies (id) on delete set null,
  customer_email text,
  payload jsonb not null default '{}'::jsonb,
  processing_status text not null default 'received'
    check (processing_status in ('received', 'processed', 'failed', 'skipped')),
  error_message text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists stripe_webhook_events_type_idx
  on public.stripe_webhook_events (event_type);

create index if not exists stripe_webhook_events_company_id_idx
  on public.stripe_webhook_events (company_id)
  where company_id is not null;

create index if not exists stripe_webhook_events_created_at_idx
  on public.stripe_webhook_events (created_at desc);

comment on table public.stripe_webhook_events is 'Audit log of all Stripe webhook events for debugging.';

alter table public.stripe_webhook_events enable row level security;
alter table public.stripe_webhook_events force row level security;
revoke all on table public.stripe_webhook_events from anon, authenticated;

-- Backfill current_period_end from subscription_ends_at where available
update public.subscriptions
set current_period_end = subscription_ends_at
where current_period_end is null and subscription_ends_at is not null;
