-- =============================================================================
--  Graduation certificates
-- =============================================================================
-- Program-level (degree) certificates, distinct from the per-course
-- public.certificates table. One graduation certificate per student per
-- program. Issued by the registrar, optionally auto-generated for students
-- who have met their program's credit + CGPA requirements.
--
-- No RLS (project convention).

create table if not exists public.graduation_certificates (
  id                uuid        primary key default gen_random_uuid(),
  student_id        uuid        not null references public.users(id) on delete restrict,
  program_id        uuid        not null references public.academic_programs(id) on delete restrict,
  unique_code       text        not null,
  classification    text,                       -- e.g. 'Distinction', 'Good Standing'
  cgpa              numeric(4,2),
  completed_credits numeric(5,1),
  graduation_term   uuid        references public.academic_terms(id) on delete set null,
  pdf_url           text,
  issued_by         uuid        references public.users(id) on delete set null,
  issued_at         timestamptz not null default now(),
  expires_at        timestamptz,
  revoked_at        timestamptz,
  revoke_reason     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint uq_graduation_certificates_code
    unique (unique_code),
  constraint uq_graduation_certificates_student_program
    unique (student_id, program_id),
  constraint chk_graduation_certificates_revoke
    check (
      (revoked_at is null and revoke_reason is null)
      or
      (revoked_at is not null and revoke_reason is not null)
    )
);

create index if not exists idx_graduation_certificates_student on public.graduation_certificates(student_id);
create index if not exists idx_graduation_certificates_program on public.graduation_certificates(program_id);

drop trigger if exists set_graduation_certificates_updated_at on public.graduation_certificates;
create trigger set_graduation_certificates_updated_at
  before update on public.graduation_certificates
  for each row execute function set_updated_at();

grant select, insert, update, delete on public.graduation_certificates to anon, authenticated;
