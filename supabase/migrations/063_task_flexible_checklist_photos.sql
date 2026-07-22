-- Flexible task checklist, photo requirements, and capture mode.

alter table public.retail_tasks
  add column if not exists checklist_items jsonb not null default '[]'::jsonb,
  add column if not exists min_photos integer not null default 0,
  add column if not exists photo_capture_mode text not null default 'camera_only'
    check (photo_capture_mode in ('camera_only', 'camera_or_gallery'));

comment on column public.retail_tasks.checklist_items is
  'Array of { id, label, required, sort_order } checklist items defined by admin.';
comment on column public.retail_tasks.min_photos is
  'Minimum number of proof photos required to submit (0 = none).';
comment on column public.retail_tasks.photo_capture_mode is
  'camera_only disables gallery; camera_or_gallery allows file picker.';

-- Backfill min_photos from legacy photo_required flag.
update public.retail_tasks
set min_photos = 1
where photo_required = true and min_photos = 0;

-- Legacy cleaning tasks: keep 3-photo minimum if category is cleaning_check.
update public.retail_tasks
set min_photos = greatest(min_photos, 3)
where category = 'cleaning_check' and min_photos < 3;

-- Seed default cleaning checklist for existing cleaning tasks without items.
update public.retail_tasks
set checklist_items = '[
  {"id":"sweep_floor","label":"Sweep Floor","required":true,"sort_order":0},
  {"id":"mop_floor","label":"Mop Floor","required":true,"sort_order":1},
  {"id":"clean_glass","label":"Clean Glass","required":true,"sort_order":2},
  {"id":"empty_trash","label":"Empty Trash","required":true,"sort_order":3},
  {"id":"arrange_display","label":"Arrange Display","required":true,"sort_order":4}
]'::jsonb
where category = 'cleaning_check'
  and (checklist_items is null or checklist_items = '[]'::jsonb);
