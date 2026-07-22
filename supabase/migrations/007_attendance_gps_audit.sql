alter table public.attendance
  add column if not exists original_staff_latitude double precision,
  add column if not exists original_staff_longitude double precision,
  add column if not exists original_gps_accuracy_meters double precision,
  add column if not exists gps_corrected_at timestamptz;

comment on column public.attendance.original_staff_latitude is 'GPS at punch before background refinement.';
comment on column public.attendance.original_staff_longitude is 'GPS at punch before background refinement.';
comment on column public.attendance.original_gps_accuracy_meters is 'Accuracy (m) at punch before refinement.';
comment on column public.attendance.gps_corrected_at is 'When background GPS refinement updated the row.';
