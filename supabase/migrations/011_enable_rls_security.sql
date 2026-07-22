-- =============================================================================
-- Row Level Security (RLS) — lock down direct PostgREST / anon key access
-- Safe to run multiple times in Supabase SQL Editor.
--
-- How this app works (unchanged after migration):
--   • Browser → Next.js API routes (/api/attendance, /api/shops, /api/admin, …)
--   • API routes use SUPABASE_SERVICE_ROLE_KEY (server only) → bypasses RLS
--   • No Supabase anon key in the frontend; clock/admin never hit DB directly
--
-- What this migration does:
--   • ENABLE + FORCE RLS on all application tables
--   • REVOKE table privileges from anon + authenticated roles
--   • Explicit deny policies for anon/authenticated (visible in Dashboard)
--   • Placeholder policies for future authenticated staff (disabled until Auth)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Enable RLS on every application table (including legacy if present)
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
    'punch_logs'
  ]
  loop
    if exists (
      select 1
      from pg_tables
      where schemaname = 'public'
        and tablename = tbl
    ) then
      execute format('alter table public.%I enable row level security', tbl);
      execute format('alter table public.%I force row level security', tbl);
      raise notice 'RLS enabled on public.%', tbl;
    end if;
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- 2) Revoke direct Data API access (anon/authenticated keys)
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
    'punch_logs'
  ]
  loop
    if exists (
      select 1
      from pg_tables
      where schemaname = 'public'
        and tablename = tbl
    ) then
      execute format('revoke all on table public.%I from anon, authenticated', tbl);
    end if;
  end loop;
end
$$;

-- Default privileges: new tables in public are not auto-exposed to anon/authenticated
alter default privileges in schema public
  revoke all on tables from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3) Deny-all policies for anon + authenticated (belt-and-suspenders)
-- -----------------------------------------------------------------------------
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
      select 1
      from pg_tables
      where schemaname = 'public'
        and tablename = tbl
    ) then
      pol := tbl || '_deny_anon_authenticated';
      execute format('drop policy if exists %I on public.%I', pol, tbl);
      execute format(
        'create policy %I on public.%I as restrictive for all to anon, authenticated using (false) with check (false)',
        pol,
        tbl
      );
    end if;
  end loop;
end
$$;

-- Legacy punch_logs (if table still exists)
do $$
begin
  if exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'punch_logs'
  ) then
    drop policy if exists punch_logs_deny_anon_authenticated on public.punch_logs;
    create policy punch_logs_deny_anon_authenticated
      on public.punch_logs
      as restrictive
      for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 4) Future: authenticated staff read only their own attendance
--    Disabled until Supabase Auth is linked to staff.id (policy uses false).
--    Replace USING clause when JWT carries staff_id, e.g.:
--    staff_id = ((select auth.jwt()) ->> 'staff_id')::uuid
-- -----------------------------------------------------------------------------
drop policy if exists attendance_staff_select_own on public.attendance;
create policy attendance_staff_select_own
  on public.attendance
  for select
  to authenticated
  using (false);

drop policy if exists staff_self_select on public.staff;
create policy staff_self_select
  on public.staff
  for select
  to authenticated
  using (false);

-- -----------------------------------------------------------------------------
-- Admin full read/write/delete:
--   Not granted via RLS policies. Server API uses service_role, which bypasses RLS.
--   Do NOT put SUPABASE_SERVICE_ROLE_KEY in the browser or NEXT_PUBLIC_* env vars.
-- -----------------------------------------------------------------------------

comment on table public.attendance is
  'Clock events. RLS enabled — access via Next.js API (service_role) only unless staff Auth policies are enabled.';
