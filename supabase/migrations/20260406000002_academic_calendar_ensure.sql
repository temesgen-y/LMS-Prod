-- Ensure academic_calendar table exists and is accessible.
-- Safe to run even if 002_expansion_rls.sql was already applied.

create table if not exists public.academic_calendar (
    id          uuid        not null default uuid_generate_v4(),
    term_id     uuid        not null references public.academic_terms(id) on delete cascade,
    event_name  text        not null,
    event_type  text        not null default 'other',
    event_date  date        not null,
    end_date    date,
    description text,
    applies_to  text        not null default 'all',
    created_by  uuid        not null references public.users(id),
    created_at  timestamptz not null default now(),
    constraint pk_academic_calendar primary key (id),
    constraint chk_acal_type check (
        event_type in (
            'registration_start','registration_end',
            'classes_start','classes_end',
            'add_drop_deadline','withdrawal_deadline',
            'exam_start','exam_end',
            'grade_submission_deadline',
            'holiday','graduation','other'
        )
    )
);

-- Grant read access to all authenticated users (students, instructors, admins)
grant select on public.academic_calendar to authenticated;
grant select on public.academic_calendar to anon;

-- Grant write access so registrar/admin can manage events
grant insert, update, delete on public.academic_calendar to authenticated;
