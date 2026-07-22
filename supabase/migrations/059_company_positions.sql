-- Company-specific positions (custom titles) based on system role templates.

create table if not exists public.company_positions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  based_on_template text not null
    check (based_on_template in ('area_manager', 'store_manager', 'supervisor', 'staff')),
  shop_scope text not null default 'assigned_only'
    check (shop_scope in ('all_shops', 'selected_shops', 'assigned_only')),
  default_permissions jsonb not null default '{}'::jsonb,
  is_system boolean not null default false,
  sort_order int not null default 0,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists company_positions_company_idx
  on public.company_positions (company_id, status, sort_order);

create unique index if not exists company_positions_system_template_idx
  on public.company_positions (company_id, based_on_template)
  where is_system = true and status = 'active';

create unique index if not exists company_positions_company_name_idx
  on public.company_positions (company_id, lower(name))
  where status = 'active';

alter table public.staff_permission_profiles
  add column if not exists position_id uuid references public.company_positions (id) on delete set null;

create index if not exists staff_permission_profiles_position_idx
  on public.staff_permission_profiles (position_id);

comment on table public.company_positions is
  'Company-defined job titles mapped to role templates. Position name is display-only; permissions control access.';

comment on column public.company_positions.based_on_template is
  'System role template this position inherits from (Staff, Supervisor, Store Manager, Area Manager).';

comment on column public.company_positions.default_permissions is
  'Permission overrides applied on top of based_on_template defaults for all employees with this position.';

-- Seed default system positions per company.
insert into public.company_positions (
  company_id, name, based_on_template, shop_scope, default_permissions, is_system, sort_order
)
select c.id, v.name, v.based_on_template, v.shop_scope, '{}'::jsonb, true, v.sort_order
from public.companies c
cross join (
  values
    ('Staff', 'staff', 'assigned_only', 1),
    ('Supervisor', 'supervisor', 'assigned_only', 2),
    ('Store Manager', 'store_manager', 'assigned_only', 3),
    ('Area Manager', 'area_manager', 'selected_shops', 4)
) as v(name, based_on_template, shop_scope, sort_order)
where not exists (
  select 1 from public.company_positions cp
  where cp.company_id = c.id and cp.is_system = true and cp.based_on_template = v.based_on_template
);

-- Link existing staff profiles to matching system positions.
update public.staff_permission_profiles p
set position_id = cp.id
from public.company_positions cp
where cp.company_id = p.company_id
  and cp.is_system = true
  and cp.based_on_template = p.role_template
  and cp.status = 'active'
  and p.position_id is null;
