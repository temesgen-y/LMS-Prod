-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: assessment_attachments
-- Creates a link table between assessments and attachments (reference files)
-- Run in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.assessment_attachments (
    id              uuid        not null default uuid_generate_v4(),
    assessment_id   uuid        not null,
    attachment_id   uuid        not null,
    sort_order      smallint    not null default 0,
    created_at      timestamptz not null default now(),

    constraint pk_assessment_attachments primary key (id),
    constraint uq_assessment_attachments unique (assessment_id, attachment_id),

    constraint fk_aasgmt_assessment
        foreign key (assessment_id)
        references public.assessments(id) on delete cascade,

    constraint fk_aasgmt_attachment
        foreign key (attachment_id)
        references public.attachments(id) on delete cascade
);

create index if not exists idx_assessment_attachments_assessment
    on public.assessment_attachments (assessment_id);

create index if not exists idx_assessment_attachments_attachment
    on public.assessment_attachments (attachment_id);

-- ── RLS ────────────────────────────────────────────────────────────────────

alter table public.assessment_attachments enable row level security;

-- Instructors can manage attachments for their own assessments
create policy "instructor_manage_assessment_attachments"
on public.assessment_attachments for all
to authenticated
using (
    assessment_id in (
        select id from public.assessments
        where created_by = (
            select id from public.users
            where auth_user_id = auth.uid()
        )
    )
);

-- Students can read attachments for published assessments in their enrolled courses
create policy "students_read_assessment_attachments"
on public.assessment_attachments for select
to authenticated
using (
    assessment_id in (
        select id from public.assessments
        where offering_id in (
            select offering_id from public.enrollments
            where student_id = (
                select id from public.users
                where auth_user_id = auth.uid()
            )
            and status = 'active'
        )
        and status = 'published'
    )
);
