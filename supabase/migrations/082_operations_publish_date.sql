-- Restore publish_date as a separate field from effective_date.

alter table public.operations_content
  add column if not exists publish_date date;

update public.operations_content
set publish_date = effective_date
where publish_date is null;

alter table public.operations_content
  alter column publish_date set not null;

comment on column public.operations_content.publish_date is
  'Date content becomes visible to staff.';
comment on column public.operations_content.effective_date is
  'Date content lifecycle becomes Active.';

drop index if exists public.operations_content_company_status_idx;
create index operations_content_company_status_idx
  on public.operations_content (company_id, status, publish_date desc);

drop index if exists public.operations_content_company_type_idx;
create index operations_content_company_type_idx
  on public.operations_content (company_id, content_type, publish_date desc);
