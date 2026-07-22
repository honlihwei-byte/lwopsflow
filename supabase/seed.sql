-- Demo shops + sample staff (run after schema.sql)
-- Replace shop UUIDs if you need fixed IDs for QR bookmarks.

insert into public.shops (id, name)
values
  ('a1000000-0000-4000-8000-000000000001', 'Main Branch'),
  ('a1000000-0000-4000-8000-000000000002', 'Silverlakes Outlet'),
  ('a1000000-0000-4000-8000-000000000003', 'Mall Kiosk')
on conflict (id) do update set name = excluded.name, updated_at = now();

insert into public.staff (id, staff_name, staff_code, staff_type, id_card_qr_value, status)
values
  (
    'b2000000-0000-4000-8000-000000000001',
    'Aina',
    'PC000001',
    'full_time',
    'card-b2000000-0000-4000-8000-000000000001',
    'active'
  ),
  (
    'b2000000-0000-4000-8000-000000000002',
    'Bala',
    'PC000002',
    'part_time',
    'card-b2000000-0000-4000-8000-000000000002',
    'active'
  ),
  (
    'b2000000-0000-4000-8000-000000000003',
    'Chen',
    'SR000001',
    'full_time',
    'card-b2000000-0000-4000-8000-000000000003',
    'active'
  ),
  (
    'b2000000-0000-4000-8000-000000000004',
    'Dina',
    'TT000001',
    'full_time',
    'card-b2000000-0000-4000-8000-000000000004',
    'active'
  )
on conflict (id) do update set
  staff_name = excluded.staff_name,
  staff_code = excluded.staff_code,
  staff_type = excluded.staff_type,
  id_card_qr_value = excluded.id_card_qr_value,
  status = excluded.status,
  updated_at = now();

insert into public.staff_shop_assignments (staff_id, shop_id)
values
  ('b2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001'),
  ('b2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001'),
  ('b2000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000002'),
  ('b2000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000003')
on conflict (staff_id, shop_id) do nothing;
