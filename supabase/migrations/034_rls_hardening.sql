-- Supabase security hardening: enable RLS + tenant isolation policies.
-- This app uses Next.js API routes with service_role (bypasses RLS).
-- Goal: prevent direct Data API access from anon/authenticated keys across tenants.

-- -----------------------------------------------------------------------------
-- Helpers for staff self-access (optional).
-- If you later add JWT app_metadata.staff_id for staff users, these policies work.
-- -----------------------------------------------------------------------------
create or replace function public.auth_staff_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select nullif(trim((auth.jwt() -> 'app_metadata' ->> 'staff_id')), '')::uuid;
$$;

revoke all on function public.auth_staff_id() from public;
grant execute on function public.auth_staff_id() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 1) Enable + FORCE RLS on all application tables
-- -----------------------------------------------------------------------------
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'companies',
    'subscriptions',
    'company_users',
    'shops',
    'shop_gps_locations',
    'staff',
    'staff_shop_assignments',
    'attendance',
    'forgot_punch_requests',
    'staff_schedule_slots',
    'staff_schedules',
    'shop_shift_templates',
    'staff_trusted_devices',
    'email_verification_tokens',
    'payments',
    'invoices',
    'notifications'
  ]
  loop
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = tbl) then
      execute format('alter table public.%I enable row level security', tbl);
      execute format('alter table public.%I force row level security', tbl);
    end if;
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- 2) Remove public access (anon/authenticated) to app tables
-- -----------------------------------------------------------------------------
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'companies',
    'subscriptions',
    'company_users',
    'shops',
    'shop_gps_locations',
    'staff',
    'staff_shop_assignments',
    'attendance',
    'forgot_punch_requests',
    'staff_schedule_slots',
    'staff_schedules',
    'shop_shift_templates',
    'staff_trusted_devices',
    'email_verification_tokens',
    'payments',
    'invoices',
    'notifications'
  ]
  loop
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = tbl) then
      execute format('revoke all on table public.%I from anon, authenticated', tbl);
    end if;
  end loop;
end
$$;

alter default privileges in schema public
  revoke all on tables from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3) Drop/replace policies (idempotent)
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'shops','shop_gps_locations','staff','staff_shop_assignments','attendance',
        'forgot_punch_requests','staff_schedule_slots','staff_schedules','shop_shift_templates',
        'staff_trusted_devices','email_verification_tokens','payments','invoices','notifications'
      )
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- 4) Tenant isolation policies
--    Company Admin: can manage only their company data.
-- -----------------------------------------------------------------------------

-- shops (has company_id)
create policy shops_company_admin_all
  on public.shops
  for all
  to authenticated
  using (auth_is_company_admin() and company_id = auth_company_id())
  with check (auth_is_company_admin() and company_id = auth_company_id());

-- shop_gps_locations (via shop.company_id)
create policy shop_gps_locations_company_admin_all
  on public.shop_gps_locations
  for all
  to authenticated
  using (auth_is_company_admin() and shop_id in (select auth_company_shop_ids()))
  with check (auth_is_company_admin() and shop_id in (select auth_company_shop_ids()));

-- staff (has company_id)
create policy staff_company_admin_all
  on public.staff
  for all
  to authenticated
  using (auth_is_company_admin() and company_id = auth_company_id())
  with check (auth_is_company_admin() and company_id = auth_company_id());

-- staff_shop_assignments (via shop.company_id)
create policy staff_shop_assignments_company_admin_all
  on public.staff_shop_assignments
  for all
  to authenticated
  using (auth_is_company_admin() and shop_id in (select auth_company_shop_ids()))
  with check (auth_is_company_admin() and shop_id in (select auth_company_shop_ids()));

-- attendance (via shop.company_id)
create policy attendance_company_admin_all
  on public.attendance
  for all
  to authenticated
  using (auth_is_company_admin() and shop_id in (select auth_company_shop_ids()))
  with check (auth_is_company_admin() and shop_id in (select auth_company_shop_ids()));

-- forgot_punch_requests (via shop.company_id)
create policy forgot_punch_requests_company_admin_all
  on public.forgot_punch_requests
  for all
  to authenticated
  using (auth_is_company_admin() and shop_id in (select auth_company_shop_ids()))
  with check (auth_is_company_admin() and shop_id in (select auth_company_shop_ids()));

-- staff_schedule_slots (via staff.company_id)
create policy staff_schedule_slots_company_admin_all
  on public.staff_schedule_slots
  for all
  to authenticated
  using (
    auth_is_company_admin()
    and exists (
      select 1 from public.staff s
      where s.id = staff_id and s.company_id = auth_company_id()
    )
  )
  with check (
    auth_is_company_admin()
    and exists (
      select 1 from public.staff s
      where s.id = staff_id and s.company_id = auth_company_id()
    )
  );

-- staff_schedules (has company_id)
create policy staff_schedules_company_admin_all
  on public.staff_schedules
  for all
  to authenticated
  using (auth_is_company_admin() and company_id = auth_company_id())
  with check (auth_is_company_admin() and company_id = auth_company_id());

-- shop_shift_templates (has company_id; shop_id may be null for company-wide)
create policy shop_shift_templates_company_admin_all
  on public.shop_shift_templates
  for all
  to authenticated
  using (auth_is_company_admin() and company_id = auth_company_id())
  with check (auth_is_company_admin() and company_id = auth_company_id());

-- staff_trusted_devices (has company_id)
create policy staff_trusted_devices_company_admin_all
  on public.staff_trusted_devices
  for all
  to authenticated
  using (auth_is_company_admin() and company_id = auth_company_id())
  with check (auth_is_company_admin() and company_id = auth_company_id());

-- email_verification_tokens (has company_id)
create policy email_verification_tokens_company_admin_all
  on public.email_verification_tokens
  for all
  to authenticated
  using (auth_is_company_admin() and company_id = auth_company_id())
  with check (auth_is_company_admin() and company_id = auth_company_id());

-- payments + invoices (billing, has company_id)
create policy payments_company_admin_all
  on public.payments
  for all
  to authenticated
  using (auth_is_company_admin() and company_id = auth_company_id())
  with check (auth_is_company_admin() and company_id = auth_company_id());

create policy invoices_company_admin_all
  on public.invoices
  for all
  to authenticated
  using (auth_is_company_admin() and company_id = auth_company_id())
  with check (auth_is_company_admin() and company_id = auth_company_id());

-- notifications (has company_id, staff_id)
create policy notifications_company_admin_all
  on public.notifications
  for all
  to authenticated
  using (auth_is_company_admin() and company_id = auth_company_id())
  with check (auth_is_company_admin() and company_id = auth_company_id());

-- -----------------------------------------------------------------------------
-- 5) Optional staff self-access (only if JWT includes app_metadata.staff_id + company_id)
-- -----------------------------------------------------------------------------

create policy staff_self_select
  on public.staff
  for select
  to authenticated
  using (
    auth_staff_id() is not null
    and id = auth_staff_id()
    and company_id = auth_company_id()
  );

create policy attendance_staff_select_own
  on public.attendance
  for select
  to authenticated
  using (
    auth_staff_id() is not null
    and staff_id = auth_staff_id()
    and shop_id in (select auth_company_shop_ids())
  );

create policy staff_schedules_staff_select_own
  on public.staff_schedules
  for select
  to authenticated
  using (
    auth_staff_id() is not null
    and staff_id = auth_staff_id()
    and company_id = auth_company_id()
  );

create policy forgot_punch_requests_staff_select_own
  on public.forgot_punch_requests
  for select
  to authenticated
  using (
    auth_staff_id() is not null
    and staff_id = auth_staff_id()
    and shop_id in (select auth_company_shop_ids())
  );

create policy notifications_staff_select_own
  on public.notifications
  for select
  to authenticated
  using (
    auth_staff_id() is not null
    and staff_id = auth_staff_id()
    and company_id = auth_company_id()
  );

