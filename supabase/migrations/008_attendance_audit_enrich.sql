-- Background punch enrichment (audit fields updated after fast insert).

alter table public.attendance
  add column if not exists audit_notes text,
  add column if not exists last_updated_at timestamptz;

comment on column public.attendance.audit_notes is 'Optional audit text from delayed post-punch enrichment.';
comment on column public.attendance.last_updated_at is 'When background enrichment last updated the row.';
