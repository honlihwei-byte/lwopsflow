-- Plan limits: shops + staff only. Add-ons for extra capacity.

alter table public.subscriptions
  add column if not exists max_shops int,
  add column if not exists extra_shops int not null default 0,
  add column if not exists extra_staff_packs int not null default 0;

comment on column public.subscriptions.plan_slug is 'trial | starter | growth | business';
comment on column public.subscriptions.max_shops is 'Base shop limit from plan (excludes extra_shops add-on)';
comment on column public.subscriptions.extra_shops is 'Add-on: extra shops at RM5/month each';
comment on column public.subscriptions.extra_staff_packs is 'Add-on: packs of 10 staff at RM5/month each';

-- Rename legacy plan slugs to new catalog
update public.subscriptions
set plan_slug = 'growth'
where plan_slug = 'business'
  and coalesce(max_staff, 30) <= 50;

update public.subscriptions
set plan_slug = 'business'
where plan_slug = 'multi_shop';

update public.subscriptions
set plan_slug = 'starter'
where plan_slug = 'enterprise';

-- Backfill limits from plan slug
update public.subscriptions s
set
  max_staff = case s.plan_slug
    when 'starter' then 15
    when 'growth' then 50
    when 'business' then 100
    else s.max_staff
  end,
  max_shops = case s.plan_slug
    when 'starter' then 2
    when 'growth' then 5
    when 'business' then 10
    else s.max_shops
  end
where s.plan_slug in ('starter', 'growth', 'business');
