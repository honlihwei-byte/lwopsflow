-- Repair: plan shop limits + add-ons (migration 035 may not have been applied on hosted Supabase).
-- Required by Stripe webhooks via syncCompanyFromSubscription / billing reads.

alter table public.subscriptions
  add column if not exists max_shops int,
  add column if not exists extra_shops int not null default 0,
  add column if not exists extra_staff_packs int not null default 0;

comment on column public.subscriptions.max_shops is 'Base shop limit from plan (excludes extra_shops add-on)';
comment on column public.subscriptions.extra_shops is 'Add-on: extra shops at RM5/month each';
comment on column public.subscriptions.extra_staff_packs is 'Add-on: packs of 10 staff at RM5/month each';

-- Backfill limits for paid plans (safe to re-run; does not downgrade custom values)
update public.subscriptions s
set
  max_staff = case
    when s.max_staff is null and s.plan_slug = 'starter' then 15
    when s.max_staff is null and s.plan_slug = 'growth' then 50
    when s.max_staff is null and s.plan_slug = 'business' then 100
    else s.max_staff
  end,
  max_shops = case
    when s.max_shops is null and s.plan_slug = 'starter' then 2
    when s.max_shops is null and s.plan_slug = 'growth' then 5
    when s.max_shops is null and s.plan_slug = 'business' then 10
    else s.max_shops
  end
where s.plan_slug in ('starter', 'growth', 'business');
