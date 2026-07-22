-- Fix multi-shop task creation: uniqueness must be per shop, not global per series.
--
-- Previous index retail_tasks_series_due_date_idx enforced UNIQUE (series_id, due_date).
-- When the same series_id is used for multiple shops (same due date), the second insert fails:
--   duplicate key value violates unique constraint "retail_tasks_series_due_date_idx"
--
-- Correct grain: one occurrence row per company + shop + series + due date.

drop index if exists public.retail_tasks_series_due_date_idx;

create unique index retail_tasks_series_due_date_idx
  on public.retail_tasks (company_id, shop_id, series_id, due_date)
  where series_id is not null;
