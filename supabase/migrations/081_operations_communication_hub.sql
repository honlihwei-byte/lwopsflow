-- Operations Hub: effective/end dates, expanded categories, XLSX attachments.

alter table public.operations_content rename column publish_date to effective_date;
alter table public.operations_content rename column expiry_date to end_date;

drop index if exists public.operations_content_company_status_idx;
create index operations_content_company_status_idx
  on public.operations_content (company_id, status, effective_date desc);

drop index if exists public.operations_content_company_type_idx;
create index operations_content_company_type_idx
  on public.operations_content (company_id, content_type, effective_date desc);

alter table public.operations_content
  drop constraint if exists operations_content_content_type_check;

update public.operations_content
set content_type = 'memo'
where content_type in ('document', 'task');

alter table public.operations_content
  add constraint operations_content_content_type_check
  check (content_type in (
    'announcement',
    'memo',
    'promotion',
    'sop',
    'training',
    'price_change',
    'emergency_notice'
  ));

comment on column public.operations_content.effective_date is
  'Date content becomes visible to staff (required).';
comment on column public.operations_content.end_date is
  'Optional last day content is active.';

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]
where id = 'operations-content';
