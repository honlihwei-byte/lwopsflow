-- Stripe subscription billing (replaces manual / WhatsApp checkout)

alter table public.companies
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

create unique index if not exists companies_stripe_customer_id_unique
  on public.companies (stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists companies_stripe_subscription_id_unique
  on public.companies (stripe_subscription_id)
  where stripe_subscription_id is not null;

alter table public.subscriptions
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_price_id text,
  add column if not exists next_billing_at timestamptz;

create unique index if not exists subscriptions_stripe_subscription_id_unique
  on public.subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;

comment on column public.companies.stripe_customer_id is 'Stripe Customer id (cus_...)';
comment on column public.companies.stripe_subscription_id is 'Active Stripe Subscription id (sub_...)';
comment on column public.subscriptions.next_billing_at is 'Next Stripe invoice / renewal date';
