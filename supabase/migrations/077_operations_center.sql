-- Operations Center: distribute memos, promotions, announcements to shops (separate from tasks).

create table if not exists public.operations_content (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null,
  description text not null default '',
  content_type text not null check (content_type in ('memo', 'promotion', 'announcement', 'sop', 'task')),
  target_all_shops boolean not null default false,
  require_acknowledgement boolean not null default false,
  publish_date date not null,
  expiry_date date,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists operations_content_company_status_idx
  on public.operations_content (company_id, status, publish_date desc);

create index if not exists operations_content_company_type_idx
  on public.operations_content (company_id, content_type, publish_date desc);

create table if not exists public.operations_content_shops (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.operations_content (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete cascade,
  unique (content_id, shop_id)
);

create index if not exists operations_content_shops_shop_idx
  on public.operations_content_shops (shop_id, content_id);

create table if not exists public.operations_attachments (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.operations_content (id) on delete cascade,
  file_name text not null,
  mime_type text not null,
  storage_path text not null,
  file_size bigint not null default 0,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists operations_attachments_content_idx
  on public.operations_attachments (content_id, sort_order);

create table if not exists public.operations_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.operations_content (id) on delete cascade,
  staff_id uuid not null references public.staff (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete cascade,
  first_viewed_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  device_info text,
  unique (content_id, staff_id)
);

create index if not exists operations_ack_content_idx
  on public.operations_acknowledgements (content_id, acknowledged_at);

create index if not exists operations_ack_staff_idx
  on public.operations_acknowledgements (staff_id, content_id);

comment on table public.operations_content is 'Operations Center broadcasts (memos, promotions, announcements, SOPs).';
comment on table public.operations_content_shops is 'Target shops when target_all_shops is false.';
comment on table public.operations_attachments is 'PDF/image/DOCX attachments for operations content.';
comment on table public.operations_acknowledgements is 'Employee read/acknowledge tracking for operations content.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'operations-content',
  'operations-content',
  false,
  10485760,
  array[
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;
