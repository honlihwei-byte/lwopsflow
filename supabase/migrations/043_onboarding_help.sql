-- Guided onboarding wizard state (company-level).

alter table public.companies
  add column if not exists onboarding_wizard_completed_at timestamptz,
  add column if not exists onboarding_wizard_skipped boolean not null default false;

comment on column public.companies.onboarding_wizard_completed_at is
  'When the first-login setup wizard was finished.';
comment on column public.companies.onboarding_wizard_skipped is
  'User chose Skip Wizard on first login.';
