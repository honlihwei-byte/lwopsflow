-- Employee self-service activation: admins no longer set permanent passwords.

-- Expand account lifecycle statuses.
alter table public.employee_accounts
  drop constraint if exists employee_accounts_status_check;

update public.employee_accounts
set status = 'disabled'
where status = 'inactive';

alter table public.employee_accounts
  add constraint employee_accounts_status_check
  check (status in ('pending_activation', 'active', 'disabled'));

-- Password optional until employee activates.
alter table public.employee_accounts
  alter column password_hash drop not null;

alter table public.employee_accounts
  add column if not exists password_set_at timestamptz,
  add column if not exists preferred_locale text default 'en'
    check (preferred_locale in ('en', 'zh', 'ms')),
  add column if not exists activation_token_hash text,
  add column if not exists activation_token_expires_at timestamptz,
  add column if not exists activation_sent_at timestamptz,
  add column if not exists reset_token_hash text,
  add column if not exists reset_token_expires_at timestamptz,
  add column if not exists reset_method text default 'link'
    check (reset_method in ('link', 'otp'));

comment on column public.employee_accounts.activation_token_hash is
  'Hashed one-time token for first-login / re-activation. Raw token never stored.';

comment on column public.employee_accounts.reset_token_hash is
  'Hashed password-reset token (link or OTP). Reserved for self-service and admin reset flows.';

-- Backfill: existing active accounts with a password were admin-created; treat as activated.
update public.employee_accounts
set password_set_at = coalesce(password_set_at, created_at)
where status = 'active' and password_hash is not null and password_set_at is null;

-- Reserve login identifiers for pending + active accounts.
drop index if exists public.employee_accounts_email_active_idx;
drop index if exists public.employee_accounts_phone_active_idx;

create unique index if not exists employee_accounts_email_reserved_idx
  on public.employee_accounts (lower(login_email))
  where login_email is not null
    and status in ('active', 'pending_activation');

create unique index if not exists employee_accounts_phone_reserved_idx
  on public.employee_accounts (login_phone)
  where login_phone is not null
    and status in ('active', 'pending_activation');
