-- Allow 30% and 50% random selfie rates (shop security frequency).

alter table public.companies drop constraint if exists companies_selfie_proof_random_percent_check;
alter table public.companies add constraint companies_selfie_proof_random_percent_check
  check (selfie_proof_random_percent in (0, 5, 10, 20, 30, 50));

alter table public.shops drop constraint if exists shops_selfie_proof_random_percent_check;
alter table public.shops add constraint shops_selfie_proof_random_percent_check
  check (
    selfie_proof_random_percent is null
    or selfie_proof_random_percent in (0, 5, 10, 20, 30, 50)
  );
