-- Fix default tenant login: Testing Company, CMP-000001 on code + login_id, password hash.
-- Does not delete attendance, shops, staff, GPS, or forgot_punch rows.

alter table public.companies
  add column if not exists login_id text,
  add column if not exists password_hash text,
  add column if not exists active boolean not null default true;

-- Canonical default row (create if missing)
insert into public.companies (
  name,
  code,
  login_id,
  password_hash,
  status,
  trial_started_at,
  trial_ends_at,
  subscription_ends_at,
  admin_pin,
  active
)
select
  'Testing Company',
  'CMP-000001',
  'CMP-000001',
  'scrypt:e6fdb20c01e4b5392c70e5eb49445c10:fd91317d3d82b1dde66c355539c7201682c131cc38969db251078551327eaa8e5bbba55c92c2e305ce65895f32780f4fd0db22b6f005fa96a6aa78f79d1eb5a8',
  'active',
  now(),
  now() + interval '14 days',
  now() + interval '100 years',
  '000000',
  true
where not exists (
  select 1 from public.companies
  where upper(coalesce(login_id, '')) = 'CMP-000001'
     or upper(code) in ('CMP-000001', 'DEFAULT')
);

-- Merge legacy DEFAULT / old names into CMP-000001
update public.companies
set
  name = 'Testing Company',
  code = 'CMP-000001',
  login_id = 'CMP-000001',
  password_hash = 'scrypt:e6fdb20c01e4b5392c70e5eb49445c10:fd91317d3d82b1dde66c355539c7201682c131cc38969db251078551327eaa8e5bbba55c92c2e305ce65895f32780f4fd0db22b6f005fa96a6aa78f79d1eb5a8',
  status = 'active',
  active = true,
  subscription_ends_at = coalesce(subscription_ends_at, now() + interval '100 years'),
  updated_at = now()
where upper(coalesce(login_id, '')) = 'CMP-000001'
   or upper(code) in ('DEFAULT', 'CMP-000001')
   or name in (
     'Existing Company',
     'Default Company',
     'Punch Card System Default',
     'Testing Company'
   );

-- Re-link shops/staff to canonical CMP-000001 company uuid
do $$
declare
  canonical_id uuid;
begin
  select id into canonical_id
  from public.companies
  where upper(login_id) = 'CMP-000001'
  limit 1;

  if canonical_id is null then
    select id into canonical_id
    from public.companies
    where upper(code) = 'CMP-000001'
    limit 1;
  end if;

  if canonical_id is null then
    return;
  end if;

  update public.shops
  set company_id = canonical_id
  where company_id is null
     or company_id in (
       select id from public.companies
       where id <> canonical_id
         and upper(code) = 'DEFAULT'
     );

  update public.staff
  set company_id = canonical_id
  where company_id is null
     or company_id in (
       select id from public.companies
       where id <> canonical_id
         and upper(code) = 'DEFAULT'
     );

  update public.staff st
  set company_id = canonical_id
  from public.staff_shop_assignments ssa
  join public.shops s on s.id = ssa.shop_id
  where ssa.staff_id = st.id
    and s.company_id = canonical_id
    and st.company_id is distinct from canonical_id;
end $$;

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
    where upper(c.login_id) = 'CMP-000001'
    on conflict (company_id) do update set
      status = 'active',
      subscription_ends_at = excluded.subscription_ends_at,
      updated_at = now();
  end if;
end $$;

comment on column public.companies.code is 'Company code (public Company ID; e.g. CMP-000001).';
comment on column public.companies.login_id is 'Company login ID (alias of code for new tenants).';
