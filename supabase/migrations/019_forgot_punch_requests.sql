-- Forgot punch requests + manual approval verification method.

create table if not exists public.forgot_punch_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete cascade,
  request_type text not null check (request_type in ('forgot_clock_in', 'forgot_clock_out')),
  requested_time timestamptz not null,
  reason text not null check (
    reason in ('forgot_to_punch', 'phone_issue', 'gps_issue', 'other')
  ),
  notes text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  attendance_id uuid references public.attendance (id) on delete set null,
  reviewed_by text,
  reviewed_at timestamptz,
  audit_old_json jsonb,
  audit_new_json jsonb,
  created_at timestamptz not null default now()
);

create index if not exists forgot_punch_requests_shop_status_idx
  on public.forgot_punch_requests (shop_id, status, created_at desc);

create index if not exists forgot_punch_requests_staff_day_idx
  on public.forgot_punch_requests (staff_id, shop_id, created_at desc);

comment on table public.forgot_punch_requests is
  'Staff-submitted corrections when they forgot to clock in or out.';
comment on column public.forgot_punch_requests.requested_time is
  'Malaysia wall time the staff claims they punched (stored as timestamptz).';
comment on column public.forgot_punch_requests.audit_old_json is
  'Attendance snapshot before approval.';
comment on column public.forgot_punch_requests.audit_new_json is
  'Attendance row created on approval.';

alter table public.attendance
  drop constraint if exists attendance_verification_method_check;

alter table public.attendance
  add constraint attendance_verification_method_check
  check (
    verification_method is null
    or verification_method in (
      'gps',
      'indoor_confidence',
      'indoor_fallback',
      'photo_proof',
      'manual_approval',
      'gps_verified',
      'gps_weak_indoor'
    )
  );
