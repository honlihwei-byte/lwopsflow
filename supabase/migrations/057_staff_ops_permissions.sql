-- Flexible retail operations permissions (new tables; does not alter existing staff columns).

create table if not exists public.staff_permission_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  staff_id uuid not null references public.staff (id) on delete cascade,
  role_template text not null default 'staff'
    check (role_template in ('area_manager', 'store_manager', 'supervisor', 'staff')),
  shop_scope text not null default 'assigned_only'
    check (shop_scope in ('all_shops', 'selected_shops', 'assigned_only')),
  permission_overrides jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id)
);

create index if not exists staff_permission_profiles_company_idx
  on public.staff_permission_profiles (company_id);

create table if not exists public.staff_permission_shops (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (staff_id, shop_id)
);

create table if not exists public.ops_audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete cascade,
  actor_type text not null,
  actor_id text,
  actor_name text not null,
  target_type text,
  target_id text,
  action text not null,
  old_value jsonb,
  new_value jsonb,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists ops_audit_logs_company_created_idx
  on public.ops_audit_logs (company_id, created_at desc);

-- Structured feedback review fields (additive only).
alter table public.retail_task_feedback
  add column if not exists shop_id uuid references public.shops (id) on delete set null;

alter table public.retail_task_feedback
  add column if not exists actor_role text;

alter table public.retail_task_feedback
  add column if not exists status text not null default 'open'
    check (status in ('open', 'reviewed', 'closed'));

alter table public.retail_task_feedback
  add column if not exists reviewed_by uuid references public.staff (id) on delete set null;

alter table public.retail_task_feedback
  add column if not exists reviewed_at timestamptz;

-- Default permission profile for existing active staff.
insert into public.staff_permission_profiles (company_id, staff_id, role_template, shop_scope)
select s.company_id, s.id, 'staff', 'assigned_only'
from public.staff s
where s.company_id is not null
  and s.status = 'active'
  and not exists (
    select 1 from public.staff_permission_profiles p where p.staff_id = s.id
  );

-- Migrate legacy staff_task_roles into role templates.
update public.staff_permission_profiles p
set
  role_template = case r.role
    when 'manager' then 'store_manager'
    when 'supervisor' then 'supervisor'
    else 'staff'
  end,
  updated_at = now()
from public.staff_task_roles r
where r.staff_id = p.staff_id;

comment on table public.staff_permission_profiles is
  'Per-employee ops role template + permission overrides. Company Admin portal auth is separate.';
