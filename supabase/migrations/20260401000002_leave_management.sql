-- Leave management tables
-- No RLS per project convention — access controlled via grants

create table if not exists public.leave_requests (
  id             uuid primary key default gen_random_uuid(),
  requester_id   uuid not null references public.users(id) on delete cascade,
  leave_type     text not null
    check (leave_type in ('annual','sick','emergency','maternity','paternity','study','unpaid')),
  start_date     date not null,
  end_date       date not null,
  total_days     int not null check (total_days > 0),
  reason         text not null,
  supporting_doc text,
  coverage_plan  text,
  status         text not null default 'pending'
    check (status in ('pending','approved','rejected','cancelled','under_review')),
  reviewed_by    uuid references public.users(id),
  reviewed_at    timestamptz,
  review_note    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists set_leave_requests_updated_at on public.leave_requests;
create trigger set_leave_requests_updated_at
  before update on public.leave_requests
  for each row execute function set_updated_at();

create table if not exists public.leave_balances (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete cascade,
  academic_year  text not null,
  leave_type     text not null
    check (leave_type in ('annual','sick','emergency','maternity','paternity','study','unpaid')),
  total_days     int not null default 0,
  used_days      int not null default 0,
  remaining_days int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, academic_year, leave_type)
);

drop trigger if exists set_leave_balances_updated_at on public.leave_balances;
create trigger set_leave_balances_updated_at
  before update on public.leave_balances
  for each row execute function set_updated_at();

create table if not exists public.leave_policies (
  id            uuid primary key default gen_random_uuid(),
  leave_type    text not null
    check (leave_type in ('annual','sick','emergency','maternity','paternity','study','unpaid')),
  days_per_year int not null default 0,
  carry_forward boolean not null default false,
  applies_to    text not null default 'instructor',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (leave_type, applies_to)
);

drop trigger if exists set_leave_policies_updated_at on public.leave_policies;
create trigger set_leave_policies_updated_at
  before update on public.leave_policies
  for each row execute function set_updated_at();

-- Grants for PostgREST access (no RLS)
grant select, insert, update, delete on public.leave_requests to anon, authenticated;
grant select, insert, update, delete on public.leave_balances to anon, authenticated;
grant select on public.leave_policies to anon, authenticated;

-- Seed default leave policies for instructors
insert into public.leave_policies (leave_type, days_per_year, carry_forward, applies_to) values
  ('annual',    21, true,  'instructor'),
  ('sick',      14, false, 'instructor'),
  ('emergency',  3, false, 'instructor'),
  ('maternity', 90, false, 'instructor'),
  ('paternity', 14, false, 'instructor'),
  ('study',     10, false, 'instructor'),
  ('unpaid',     0, false, 'instructor')
on conflict (leave_type, applies_to) do nothing;
