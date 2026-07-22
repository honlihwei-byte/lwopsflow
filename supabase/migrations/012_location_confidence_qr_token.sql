-- Phase 1: location confidence score on attendance
-- Phase 2: punch QR token on shops

alter table public.attendance
  add column if not exists location_confidence_score integer;

comment on column public.attendance.location_confidence_score is
  'GPS confidence 0–100 at punch time (distance, accuracy, sample stability, session).';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.attendance'::regclass
      and conname = 'attendance_location_confidence_score_check'
  ) then
    alter table public.attendance
      add constraint attendance_location_confidence_score_check
      check (
        location_confidence_score is null
        or (location_confidence_score >= 0 and location_confidence_score <= 100)
      );
  end if;
end
$$;

alter table public.shops
  add column if not exists punch_qr_token text;

comment on column public.shops.punch_qr_token is
  'Secret token embedded in clock QR URL (?t=). Regenerate invalidates old QR codes.';

-- Backfill tokens for existing shops (idempotent)
update public.shops
set punch_qr_token = encode(gen_random_bytes(24), 'hex')
where punch_qr_token is null or punch_qr_token = '';
