-- Track Stripe cancel-at-period-end on subscriptions

alter table public.subscriptions
  add column if not exists cancel_at_period_end boolean not null default false;

comment on column public.subscriptions.cancel_at_period_end is 'True when Stripe subscription is set to cancel at current period end';
