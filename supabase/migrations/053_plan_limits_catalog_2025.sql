-- Align stored subscription caps with current plan catalog (display/enforcement also uses catalog in app).
-- Safe for existing rows: Business becomes unlimited (null); Starter/Growth get new caps.

update public.subscriptions
set
  max_shops = 3,
  max_staff = 30,
  updated_at = now()
where plan_slug = 'starter';

update public.subscriptions
set
  max_shops = 10,
  max_staff = 100,
  updated_at = now()
where plan_slug = 'growth';

update public.subscriptions
set
  max_shops = null,
  max_staff = null,
  updated_at = now()
where plan_slug = 'business';
