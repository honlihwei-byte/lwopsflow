-- Employee portal login accounts (optional per staff; QR clock-in remains unchanged).

create table if not exists public.employee_accounts (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  login_email text,
  login_phone text,
  password_hash text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_accounts_login_present check (
    login_email is not null or login_phone is not null
  ),
  constraint employee_accounts_staff_unique unique (staff_id)
);

create unique index if not exists employee_accounts_email_active_idx
  on public.employee_accounts (lower(login_email))
  where login_email is not null and status = 'active';

create unique index if not exists employee_accounts_phone_active_idx
  on public.employee_accounts (login_phone)
  where login_phone is not null and status = 'active';

create index if not exists employee_accounts_company_idx
  on public.employee_accounts (company_id);

comment on table public.employee_accounts is
  'Optional employee portal credentials linked to staff. Does not replace QR clock-in.';

-- In-app notifications (WhatsApp / push placeholders via delivery_channel).

create table if not exists public.employee_notifications (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link_path text,
  metadata jsonb not null default '{}'::jsonb,
  delivery_channel text not null default 'in_app'
    check (delivery_channel in ('in_app', 'whatsapp', 'push', 'email')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists employee_notifications_staff_unread_idx
  on public.employee_notifications (staff_id, read_at)
  where read_at is null;

create index if not exists employee_notifications_staff_created_idx
  on public.employee_notifications (staff_id, created_at desc);

comment on table public.employee_notifications is
  'Employee in-app notifications. delivery_channel reserved for future WhatsApp/push.';

-- Future outbound queue placeholder (no processor yet).

create table if not exists public.employee_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid references public.employee_notifications(id) on delete set null,
  staff_id uuid not null references public.staff(id) on delete cascade,
  channel text not null check (channel in ('whatsapp', 'push', 'email')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'skipped')),
  error_message text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

comment on table public.employee_notification_outbox is
  'Placeholder queue for future WhatsApp/push delivery. Not processed in MVP.';
