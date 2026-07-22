-- Operations Hub: expanded content types, task completion, photo proof, read tracking.

alter table public.operations_content
  drop constraint if exists operations_content_content_type_check;

alter table public.operations_content
  add constraint operations_content_content_type_check
  check (content_type in (
    'announcement',
    'memo',
    'promotion',
    'sop',
    'training',
    'document'
  ));

-- Migrate legacy "task" rows to document if any exist.
update public.operations_content set content_type = 'document' where content_type = 'task';

alter table public.operations_content
  add column if not exists require_task_completion boolean not null default false;

alter table public.operations_content
  add column if not exists require_photo_proof boolean not null default false;

alter table public.operations_acknowledgements
  add column if not exists task_completed_at timestamptz;

alter table public.operations_acknowledgements
  add column if not exists photo_proof_path text;

alter table public.operations_acknowledgements
  add column if not exists photo_proof_uploaded_at timestamptz;

comment on column public.operations_content.require_task_completion is
  'Staff must mark the item as completed.';
comment on column public.operations_content.require_photo_proof is
  'Staff must upload photo proof before finishing.';

-- Extend bucket mime types for legacy .doc files.
update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]
where id = 'operations-content';
