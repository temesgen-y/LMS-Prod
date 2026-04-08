-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: student_answer_attachments
-- Allows students to upload files per answer for essay/short_answer questions.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.student_answer_attachments (
    id            uuid        not null default uuid_generate_v4(),
    answer_id     uuid        not null,
    attachment_id uuid        not null,
    created_at    timestamptz not null default now(),

    constraint pk_student_answer_attachments
        primary key (id),

    constraint uq_student_answer_attachments
        unique (answer_id, attachment_id),

    constraint fk_saa_answer
        foreign key (answer_id)
        references public.student_answers (id)
        on delete cascade,

    constraint fk_saa_attachment
        foreign key (attachment_id)
        references public.attachments (id)
        on delete cascade
);

-- Index for fast lookup by answer
create index if not exists idx_saa_answer_id
    on public.student_answer_attachments (answer_id);

-- Index for fast lookup by attachment
create index if not exists idx_saa_attachment_id
    on public.student_answer_attachments (attachment_id);
