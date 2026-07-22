-- Optional billing contacts separate from registered login email.
alter table public.companies
  add column if not exists billing_contact_email text,
  add column if not exists billing_contact_phone text;
