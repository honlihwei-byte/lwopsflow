-- Link company admin accounts to Supabase Auth users (email verification via Auth).

alter table public.companies
  add column if not exists auth_user_id uuid;

create unique index if not exists companies_auth_user_id_idx
  on public.companies (auth_user_id)
  where auth_user_id is not null;

comment on column public.companies.auth_user_id is 'Supabase auth.users id for company admin email/password login.';
