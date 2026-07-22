-- Allow Forgot Punch requests for break punches (rest out / rest in)
-- alongside the existing clock in / clock out request types.

alter table public.forgot_punch_requests
  drop constraint if exists forgot_punch_requests_request_type_check;

alter table public.forgot_punch_requests
  add constraint forgot_punch_requests_request_type_check
  check (request_type in (
    'forgot_clock_in',
    'forgot_clock_out',
    'forgot_rest_out',
    'forgot_rest_in'
  ));
