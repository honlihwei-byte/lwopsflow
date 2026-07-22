-- Multi-shift per day: sequence ordering (no unique constraint on staff+date).

alter table public.staff_schedules
  add column if not exists sequence_no smallint not null default 1;

create index if not exists staff_schedules_staff_date_shop_seq_idx
  on public.staff_schedules (staff_id, shift_date, shop_id, sequence_no);

comment on column public.staff_schedules.sequence_no is 'Order of shift on same staff/date/shop (1-based).';
