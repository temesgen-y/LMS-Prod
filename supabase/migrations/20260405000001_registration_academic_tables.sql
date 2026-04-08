-- Registration & Academic tables (safe to run even if 002_expansion_rls.sql was already applied)
-- Following project convention: NO row-level security, grants to authenticated role only.

-- ── course_prerequisites ──────────────────────────────────────────────────────
create table if not exists public.course_prerequisites (
  id                    uuid primary key default gen_random_uuid(),
  course_id             uuid not null references public.courses(id) on delete cascade,
  prerequisite_course_id uuid not null references public.courses(id) on delete cascade,
  prereq_type           text not null default 'hard'
                          check (prereq_type in ('hard','soft','recommended')),
  required_grade        text,
  created_at            timestamptz not null default now(),
  unique (course_id, prerequisite_course_id)
);

-- ── registration_requests ────────────────────────────────────────────────────
create table if not exists public.registration_requests (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.users(id) on delete cascade,
  offering_id     uuid not null references public.course_offerings(id) on delete cascade,
  term_id         uuid not null references public.academic_terms(id),
  request_type    text not null default 'registration'
                    check (request_type in ('registration','add','drop')),
  status          text not null default 'pending'
                    check (status in ('pending','approved','rejected','cancelled','under_review')),
  reason          text,
  prereq_override boolean not null default false,
  override_reason text,
  reviewed_by     uuid references public.users(id),
  reviewed_at     timestamptz,
  rejection_note  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── withdrawal_requests ──────────────────────────────────────────────────────
create table if not exists public.withdrawal_requests (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.users(id) on delete cascade,
  offering_id     uuid not null references public.course_offerings(id) on delete cascade,
  reason          text not null,
  reason_category text not null
                    check (reason_category in ('medical','financial','personal','academic','military','other')),
  supporting_doc  text,
  status          text not null default 'pending'
                    check (status in ('pending','approved','rejected','cancelled')),
  grade_impact    text default 'W',
  review_note     text,
  effective_date  date,
  reviewed_by     uuid references public.users(id),
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── readmission_requests ─────────────────────────────────────────────────────
create table if not exists public.readmission_requests (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.users(id) on delete cascade,
  term_requested  uuid references public.academic_terms(id),
  reason          text not null,
  gap_explanation text,
  supporting_docs text[],
  status          text not null default 'pending'
                    check (status in ('pending','approved','rejected','deferred','under_review')),
  decision_note   text,
  reviewed_by     uuid references public.users(id),
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── clearance_requests ───────────────────────────────────────────────────────
create table if not exists public.clearance_requests (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references public.users(id) on delete cascade,
  clearance_type    text not null
                      check (clearance_type in ('graduation','withdrawal','transfer','annual')),
  status            text not null default 'pending'
                      check (status in ('pending','in_progress','cleared','rejected')),
  library_cleared   boolean not null default false,
  dept_cleared      boolean not null default false,
  registrar_cleared boolean not null default false,
  notes             text,
  completed_at      timestamptz,
  created_at        timestamptz not null default now()
);

-- ── student_fee_accounts ─────────────────────────────────────────────────────
create table if not exists public.student_fee_accounts (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.users(id) on delete cascade,
  term_id      uuid not null references public.academic_terms(id),
  total_amount numeric(12,2) not null default 0,
  paid_amount  numeric(12,2) not null default 0,
  balance      numeric(12,2) not null default 0,
  status       text not null default 'unpaid'
                 check (status in ('paid','unpaid','partial','waived','overdue')),
  due_date     date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── payments ─────────────────────────────────────────────────────────────────
create table if not exists public.payments (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.users(id) on delete cascade,
  term_id          uuid references public.academic_terms(id),
  fee_account_id   uuid references public.student_fee_accounts(id),
  amount           numeric(12,2) not null,
  payment_method   text not null default 'cash'
                     check (payment_method in ('cash','bank_transfer','online','scholarship','waiver','other')),
  reference_no     text,
  recorded_by      uuid references public.users(id),
  payment_date     date not null default current_date,
  notes            text,
  created_at       timestamptz not null default now()
);

-- ── academic_standing ────────────────────────────────────────────────────────
create table if not exists public.academic_standing (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references public.users(id) on delete cascade,
  term_id           uuid not null references public.academic_terms(id),
  gpa               numeric(4,2),
  cumulative_gpa    numeric(4,2),
  standing          text not null
                      check (standing in ('good','warning','probation','suspension','dismissed','honors')),
  credits_earned    numeric(6,2) default 0,
  credits_attempted numeric(6,2) default 0,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (student_id, term_id)
);

-- ── updated_at triggers ──────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'set_updated_at_registration_requests') then
    create trigger set_updated_at_registration_requests
      before update on public.registration_requests
      for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'set_updated_at_withdrawal_requests') then
    create trigger set_updated_at_withdrawal_requests
      before update on public.withdrawal_requests
      for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'set_updated_at_readmission_requests') then
    create trigger set_updated_at_readmission_requests
      before update on public.readmission_requests
      for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'set_updated_at_fee_accounts') then
    create trigger set_updated_at_fee_accounts
      before update on public.student_fee_accounts
      for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'set_updated_at_academic_standing') then
    create trigger set_updated_at_academic_standing
      before update on public.academic_standing
      for each row execute function public.set_updated_at();
  end if;
end $$;

-- ── grants ───────────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.course_prerequisites     to authenticated;
grant select, insert, update, delete on public.registration_requests    to authenticated;
grant select, insert, update, delete on public.withdrawal_requests      to authenticated;
grant select, insert, update, delete on public.readmission_requests     to authenticated;
grant select, insert, update, delete on public.clearance_requests       to authenticated;
grant select, insert, update, delete on public.student_fee_accounts     to authenticated;
grant select, insert, update, delete on public.payments                 to authenticated;
grant select, insert, update, delete on public.academic_standing        to authenticated;
