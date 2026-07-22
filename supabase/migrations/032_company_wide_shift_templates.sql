-- Company-wide + shop-specific shift templates.
-- Existing rows remain valid. If shop_id is null => company-wide.
-- If shop_id exists => shop-specific.

alter table public.shop_shift_templates
  alter column shop_id drop not null;

create index if not exists shop_shift_templates_company_idx
  on public.shop_shift_templates (company_id, shop_id, sort_order);

comment on column public.shop_shift_templates.shop_id is 'Null means company-wide template; non-null means shop-specific.';

