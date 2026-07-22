-- SaaS RLS: companies, subscriptions, company_users + tenant isolation helpers.
-- JWT app_metadata expected: { "role": "company_admin"|"super_admin", "company_id": "<uuid>" }
-- Service role (Next.js API) bypasses RLS — unchanged.

-- -----------------------------------------------------------------------------
-- 1) subscriptions + company_users (if not present)
-- -----------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  status text not null default 'trial'
    check (status in ('trial', 'active', 'suspended', 'expired')),
  trial_started_at timestamptz not null default now(),
  trial_ends_at timestamptz,
  subscription_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id)
);

create index if not exists subscriptions_company_id_idx on public.subscriptions (company_id);

create table if not exists public.company_users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('company_admin', 'super_admin')),
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists company_users_company_id_idx on public.company_users (company_id);
create index if not exists company_users_role_idx on public.company_users (role);

comment on table public.subscriptions is 'Per-company subscription; mirrors companies billing status.';
comment on table public.company_users is 'Maps Supabase Auth user_id to company + role for RLS.';
comment on column public.company_users.company_id is 'Null only for platform Super Admin users.';

-- Backfill subscriptions from existing companies (no attendance changes).
insert into public.subscriptions (
  company_id,
  status,
  trial_started_at,
  trial_ends_at,
  subscription_ends_at
)
select
  c.id,
  c.status,
  c.trial_started_at,
  c.trial_ends_at,
  c.subscription_ends_at
from public.companies c
where not exists (
  select 1 from public.subscriptions s where s.company_id = c.id
);

-- -----------------------------------------------------------------------------
-- 2) JWT helpers (security definer, read auth.jwt())
-- -----------------------------------------------------------------------------
create or replace function public.auth_jwt_app_meta()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() -> 'app_metadata', '{}'::jsonb);
$$;

create or replace function public.auth_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(trim(auth_jwt_app_meta() ->> 'role'), '');
$$;

create or replace function public.auth_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select nullif(trim(auth_jwt_app_meta() ->> 'company_id'), '')::uuid;
$$;

create or replace function public.auth_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth_user_role() = 'super_admin';
$$;

create or replace function public.auth_is_company_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth_user_role() = 'company_admin' and auth_company_id() is not null;
$$;

create or replace function public.auth_company_shop_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.shops where company_id = auth_company_id();
$$;

revoke all on function public.auth_jwt_app_meta() from public;
revoke all on function public.auth_user_role() from public;
revoke all on function public.auth_company_id() from public;
revoke all on function public.auth_is_super_admin() from public;
revoke all on function public.auth_is_company_admin() from public;
revoke all on function public.auth_company_shop_ids() from public;

grant execute on function public.auth_jwt_app_meta() to authenticated, service_role;
grant execute on function public.auth_user_role() to authenticated, service_role;
grant execute on function public.auth_company_id() to authenticated, service_role;
grant execute on function public.auth_is_super_admin() to authenticated, service_role;
grant execute on function public.auth_is_company_admin() to authenticated, service_role;
grant execute on function public.auth_company_shop_ids() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3) Enable RLS on SaaS tables
-- -----------------------------------------------------------------------------
alter table public.companies enable row level security;
alter table public.companies force row level security;
alter table public.subscriptions enable row level security;
alter table public.subscriptions force row level security;
alter table public.company_users enable row level security;
alter table public.company_users force row level security;

revoke all on table public.companies from anon, authenticated;
revoke all on table public.subscriptions from anon, authenticated;
revoke all on table public.company_users from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4) Drop old SaaS policies if re-run
-- -----------------------------------------------------------------------------
drop policy if exists companies_deny_anon on public.companies;
drop policy if exists companies_super_admin_all on public.companies;
drop policy if exists companies_company_admin_select on public.companies;
drop policy if exists companies_company_admin_update on public.companies;

drop policy if exists subscriptions_deny_anon on public.subscriptions;
drop policy if exists subscriptions_super_admin_all on public.subscriptions;
drop policy if exists subscriptions_company_admin_all on public.subscriptions;

drop policy if exists company_users_deny_anon on public.company_users;
drop policy if exists company_users_super_admin_all on public.company_users;
drop policy if exists company_users_company_admin_select on public.company_users;
drop policy if exists company_users_company_admin_manage on public.company_users;
drop policy if exists company_users_company_admin_update on public.company_users;

-- -----------------------------------------------------------------------------
-- 5) companies policies
-- -----------------------------------------------------------------------------
create policy companies_deny_anon
  on public.companies
  as restrictive
  for all
  to anon
  using (false)
  with check (false);

create policy companies_super_admin_all
  on public.companies
  for all
  to authenticated
  using (auth_is_super_admin())
  with check (auth_is_super_admin());

create policy companies_company_admin_select
  on public.companies
  for select
  to authenticated
  using (auth_is_company_admin() and id = auth_company_id());

create policy companies_company_admin_update
  on public.companies
  for update
  to authenticated
  using (auth_is_company_admin() and id = auth_company_id())
  with check (auth_is_company_admin() and id = auth_company_id());

-- -----------------------------------------------------------------------------
-- 6) subscriptions policies
-- -----------------------------------------------------------------------------
create policy subscriptions_deny_anon
  on public.subscriptions
  as restrictive
  for all
  to anon
  using (false)
  with check (false);

create policy subscriptions_super_admin_all
  on public.subscriptions
  for all
  to authenticated
  using (auth_is_super_admin())
  with check (auth_is_super_admin());

create policy subscriptions_company_admin_all
  on public.subscriptions
  for all
  to authenticated
  using (auth_is_company_admin() and company_id = auth_company_id())
  with check (auth_is_company_admin() and company_id = auth_company_id());

-- -----------------------------------------------------------------------------
-- 7) company_users policies
-- -----------------------------------------------------------------------------
create policy company_users_deny_anon
  on public.company_users
  as restrictive
  for all
  to anon
  using (false)
  with check (false);

create policy company_users_super_admin_all
  on public.company_users
  for all
  to authenticated
  using (auth_is_super_admin())
  with check (auth_is_super_admin());

create policy company_users_company_admin_select
  on public.company_users
  for select
  to authenticated
  using (auth_is_company_admin() and company_id = auth_company_id());

create policy company_users_company_admin_manage
  on public.company_users
  for insert
  to authenticated
  with check (auth_is_company_admin() and company_id = auth_company_id());

create policy company_users_company_admin_update
  on public.company_users
  for update
  to authenticated
  using (auth_is_company_admin() and company_id = auth_company_id())
  with check (auth_is_company_admin() and company_id = auth_company_id());

-- -----------------------------------------------------------------------------
-- 8) Operational tables: company_admin scoped + block super_admin
--     (attendance, staff, shops, GPS — super admin cannot read/write)
-- -----------------------------------------------------------------------------
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'shops',
    'shop_gps_locations',
    'staff',
    'staff_shop_assignments',
    'attendance',
    'forgot_punch_requests'
  ]
  loop
    if exists (
      select 1 from pg_tables where schemaname = 'public' and tablename = tbl
    ) then
      execute format('alter table public.%I enable row level security', tbl);
      execute format('alter table public.%I force row level security', tbl);
    end if;
  end loop;
end
$$;

-- Block super admin on operational data (restrictive)
drop policy if exists shops_block_super_admin on public.shops;
create policy shops_block_super_admin
  on public.shops
  as restrictive
  for all
  to authenticated
  using (not auth_is_super_admin())
  with check (not auth_is_super_admin());

drop policy if exists shops_company_admin_all on public.shops;
create policy shops_company_admin_all
  on public.shops
  for all
  to authenticated
  using (auth_is_company_admin() and company_id = auth_company_id())
  with check (auth_is_company_admin() and company_id = auth_company_id());

drop policy if exists staff_block_super_admin on public.staff;
create policy staff_block_super_admin
  on public.staff
  as restrictive
  for all
  to authenticated
  using (not auth_is_super_admin())
  with check (not auth_is_super_admin());

drop policy if exists staff_company_admin_all on public.staff;
create policy staff_company_admin_all
  on public.staff
  for all
  to authenticated
  using (auth_is_company_admin() and company_id = auth_company_id())
  with check (auth_is_company_admin() and company_id = auth_company_id());

drop policy if exists staff_shop_assignments_block_super_admin on public.staff_shop_assignments;
create policy staff_shop_assignments_block_super_admin
  on public.staff_shop_assignments
  as restrictive
  for all
  to authenticated
  using (not auth_is_super_admin())
  with check (not auth_is_super_admin());

drop policy if exists staff_shop_assignments_company_admin_all on public.staff_shop_assignments;
create policy staff_shop_assignments_company_admin_all
  on public.staff_shop_assignments
  for all
  to authenticated
  using (
    auth_is_company_admin()
    and shop_id in (select auth_company_shop_ids())
  )
  with check (
    auth_is_company_admin()
    and shop_id in (select auth_company_shop_ids())
  );

drop policy if exists shop_gps_locations_block_super_admin on public.shop_gps_locations;
create policy shop_gps_locations_block_super_admin
  on public.shop_gps_locations
  as restrictive
  for all
  to authenticated
  using (not auth_is_super_admin())
  with check (not auth_is_super_admin());

drop policy if exists shop_gps_locations_company_admin_all on public.shop_gps_locations;
create policy shop_gps_locations_company_admin_all
  on public.shop_gps_locations
  for all
  to authenticated
  using (
    auth_is_company_admin()
    and shop_id in (select auth_company_shop_ids())
  )
  with check (
    auth_is_company_admin()
    and shop_id in (select auth_company_shop_ids())
  );

drop policy if exists attendance_block_super_admin on public.attendance;
create policy attendance_block_super_admin
  on public.attendance
  as restrictive
  for all
  to authenticated
  using (not auth_is_super_admin())
  with check (not auth_is_super_admin());

drop policy if exists attendance_company_admin_all on public.attendance;
create policy attendance_company_admin_all
  on public.attendance
  for all
  to authenticated
  using (
    auth_is_company_admin()
    and shop_id in (select auth_company_shop_ids())
  )
  with check (
    auth_is_company_admin()
    and shop_id in (select auth_company_shop_ids())
  );

do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'forgot_punch_requests') then
    drop policy if exists forgot_punch_requests_block_super_admin on public.forgot_punch_requests;
    create policy forgot_punch_requests_block_super_admin
      on public.forgot_punch_requests
      as restrictive
      for all
      to authenticated
      using (not auth_is_super_admin())
      with check (not auth_is_super_admin());

    drop policy if exists forgot_punch_requests_company_admin_all on public.forgot_punch_requests;
    create policy forgot_punch_requests_company_admin_all
      on public.forgot_punch_requests
      for all
      to authenticated
      using (
        auth_is_company_admin()
        and shop_id in (select auth_company_shop_ids())
      )
      with check (
        auth_is_company_admin()
        and shop_id in (select auth_company_shop_ids())
      );
  end if;
end
$$;

-- Deny anon on operational tables (belt-and-suspenders alongside 011).
do $$
declare
  tbl text;
  pol text;
begin
  foreach tbl in array array[
    'shops',
    'shop_gps_locations',
    'staff',
    'staff_shop_assignments',
    'attendance'
  ]
  loop
    if exists (
      select 1 from pg_tables where schemaname = 'public' and tablename = tbl
    ) then
      pol := tbl || '_deny_anon';
      execute format('drop policy if exists %I on public.%I', pol, tbl);
      execute format(
        'create policy %I on public.%I as restrictive for all to anon using (false) with check (false)',
        pol,
        tbl
      );
    end if;
  end loop;
end
$$;

comment on function public.auth_company_id() is
  'RLS helper: company_id from JWT app_metadata for Company Admin.';
comment on function public.auth_is_super_admin() is
  'RLS helper: true when JWT app_metadata.role is super_admin (platform only, no attendance).';
