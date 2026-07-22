-- Composite task scoring: 70% system + 20% manager review + 10% consistency bonus.

alter table public.retail_task_verifications
  add column if not exists system_score smallint,
  add column if not exists manager_score smallint,
  add column if not exists consistency_bonus smallint,
  add column if not exists final_score smallint,
  add column if not exists score_breakdown jsonb;

comment on column public.retail_task_verifications.system_score is
  'Objective score (0–70): completion, timeliness, checklist, photos.';

comment on column public.retail_task_verifications.manager_score is
  'Manager review component (0–20): accepted=20, fair=10, rejected=0.';

comment on column public.retail_task_verifications.consistency_bonus is
  'Streak / consistency bonus (0–10).';

comment on column public.retail_task_verifications.final_score is
  'Final task score (0–100) = system + manager + consistency.';

comment on column public.retail_task_verifications.score_breakdown is
  'Explainable JSON breakdown shown to staff and managers.';

create index if not exists retail_task_verifications_final_score_idx
  on public.retail_task_verifications (verifier_id, verified_at desc)
  where verifier_id is not null;
