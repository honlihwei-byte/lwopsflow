-- Single default tenant: CMP-000001. Links all legacy shops/staff; does not touch attendance rows.

alter table public.companies
  add column if not exists login_id text,
  add column if not exists password_hash text,
  add column if not exists owner_name text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists active boolean not null default true;

alter table public.shops
  add column if not exists company_id uuid references public.companies (id) on delete restrict;

alter table public.staff
  add column if not exists company_id uuid references public.companies (id) on delete restrict;

-- Password hash for default company (scrypt; set via migration tooling — not stored in plain text).
-- Regenerate: node scripts/hash-password.mjs <password>
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
  'Punch Card System Default',
  'DEFAULT',
  'CMP-000001',
  'scrypt:e6fdb20c01e4b5392c70e5eb49445c10:fd91317d3d82b1dde66c355539c7201682c131cc38969db251078551327eaa8e5bbba55c92c2e305ce65895f32780f4fd0db22b6f005fa96a6aa78f79d1eb5a8',
  'active',
  now(),
  now() + interval '14 days',
  now() + interval '100 years',
  '000000',
  true
where not exists (
  select 1 from public.companies where upper(login_id) = 'CMP-000001'
);

-- Upsert canonical row by login_id (merge legacy DEFAULT / Existing Company rows)
update public.companies
set
  name = 'Punch Card System Default',
  code = 'DEFAULT',
  login_id = 'CMP-000001',
  password_hash = 'scrypt:e6fdb20c01e4b5392c70e5eb49445c10:fd91317d3d82b1dde66c355539c7201682c131cc38969db251078551327eaa8e5bbba55c92c2e305ce65895f32780f4fd0db22b6f005fa96a6aa78f79d1eb5a8',
  status = 'active',
  active = true,
  subscription_ends_at = coalesce(subscription_ends_at, now() + interval '100 years'),
  updated_at = now()
where upper(login_id) = 'CMP-000001'
   or upper(code) = 'DEFAULT'
   or name in ('Existing Company', 'Default Company', 'Punch Card System Default');

-- If multiple legacy rows existed, ensure one canonical id then re-link (safe: only DEFAULT-named/code)
do $$
declare
  canonical_id uuid;
  legacy_ids uuid[];
begin
  select id into canonical_id from public.companies where upper(login_id) = 'CMP-000001' limit 1;

  if canonical_id is null then
    return;
  end if;

  select array_agg(id) into legacy_ids
  from public.companies
  where id <> canonical_id
    and (upper(code) = 'DEFAULT' or name in ('Existing Company', 'Default Company'));

  if legacy_ids is not null then
    update public.shops set company_id = canonical_id where company_id = any (legacy_ids);
    update public.staff set company_id = canonical_id where company_id = any (legacy_ids);
    delete from public.subscriptions where company_id = any (legacy_ids);
    delete from public.company_users where company_id = any (legacy_ids);
    delete from public.companies where id = any (legacy_ids);
  end if;
end $$;

-- Link all shops and staff to CMP-000001 (null or any pre-merge legacy DEFAULT id)
update public.shops s
set company_id = c.id
from public.companies c
where upper(c.login_id) = 'CMP-000001'
  and (s.company_id is null or s.company_id in (
    select id from public.companies where upper(code) = 'DEFAULT' and upper(coalesce(login_id, '')) <> 'CMP-000001'
  ));

update public.staff st
set company_id = c.id
from public.companies c
where upper(c.login_id) = 'CMP-000001'
  and st.company_id is null;

update public.staff st
set company_id = s.company_id
from public.staff_shop_assignments ssa
join public.shops s on s.id = ssa.shop_id
join public.companies c on c.id = s.company_id
where ssa.staff_id = st.id
  and upper(c.login_id) = 'CMP-000001'
  and st.company_id is null;

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

comment on column public.companies.login_id is 'Company login ID (e.g. CMP-000001 for default tenant).';
