-- Allow task reviews by company_admin / area_manager when no staff verifier is
-- appointed. The verifier may not be a staff row, so verifier_id becomes nullable
-- and the FK switches to ON DELETE SET NULL so review history survives staff deletion.

alter table public.retail_task_verifications
  drop constraint if exists retail_task_verifications_verifier_id_fkey;

alter table public.retail_task_verifications
  alter column verifier_id drop not null;

alter table public.retail_task_verifications
  add constraint retail_task_verifications_verifier_id_fkey
  foreign key (verifier_id) references public.staff (id) on delete set null;
