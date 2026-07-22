-- Positions are job titles only; system roles (role_template) control permissions.

alter table public.company_positions
  drop constraint if exists company_positions_status_check;

update public.company_positions
set status = 'archived'
where status = 'inactive';

update public.company_positions
set status = 'archived'
where is_system = true;

-- Unlink staff from archived / legacy system positions (permissions stay on role_template).
update public.staff_permission_profiles p
set position_id = null
from public.company_positions cp
where cp.id = p.position_id
  and cp.status = 'archived';

alter table public.company_positions
  add constraint company_positions_status_check
  check (status in ('active', 'archived'));

comment on table public.company_positions is
  'Company-defined job titles (e.g. Promoter, Cashier). Display only — does not control permissions.';

comment on column public.company_positions.based_on_template is
  'Deprecated — kept for migration compatibility. Permissions use staff_permission_profiles.role_template.';

comment on column public.company_positions.default_permissions is
  'Deprecated — not used for access control.';
