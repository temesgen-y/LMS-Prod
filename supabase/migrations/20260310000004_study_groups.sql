-- =============================================================================
-- Study Groups feature
-- Tables: study_groups, study_group_members, study_group_messages,
--         study_group_attachments
-- =============================================================================

-- -------------------------------------------------------
-- study_groups
-- one group per course offering, created by a student
-- -------------------------------------------------------
create table if not exists public.study_groups (
    id           uuid        not null default uuid_generate_v4(),
    offering_id  uuid        not null,
    created_by   uuid        not null,
    name         text        not null,
    description  text,
    is_active    boolean     not null default true,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),

    constraint pk_study_groups
        primary key (id),
    constraint uq_study_groups_name
        unique (offering_id, name),
    constraint fk_study_groups_offering
        foreign key (offering_id)
        references public.course_offerings(id)
        on delete cascade,
    constraint fk_study_groups_created_by
        foreign key (created_by)
        references public.users(id)
        on delete restrict
);

create index if not exists idx_study_groups_offering
    on public.study_groups(offering_id);
create index if not exists idx_study_groups_created_by
    on public.study_groups(created_by);

create or replace trigger trg_study_groups_updated_at
    before update on public.study_groups
    for each row execute function public.set_updated_at();


-- -------------------------------------------------------
-- study_group_members
-- tracks who belongs to each group and their status
-- -------------------------------------------------------
create table if not exists public.study_group_members (
    id           uuid        not null default uuid_generate_v4(),
    group_id     uuid        not null,
    student_id   uuid        not null,
    role         text        not null default 'member',
    status       text        not null default 'active',
    invited_by   uuid,
    joined_at    timestamptz not null default now(),

    constraint pk_study_group_members
        primary key (id),
    constraint uq_study_group_members
        unique (group_id, student_id),
    constraint fk_sgm_group
        foreign key (group_id)
        references public.study_groups(id)
        on delete cascade,
    constraint fk_sgm_student
        foreign key (student_id)
        references public.users(id)
        on delete cascade,
    constraint fk_sgm_invited_by
        foreign key (invited_by)
        references public.users(id)
        on delete set null,
    constraint chk_sgm_role
        check (role in ('owner','member')),
    constraint chk_sgm_status
        check (status in ('invited','active','left'))
);

create index if not exists idx_sgm_group
    on public.study_group_members(group_id);
create index if not exists idx_sgm_student
    on public.study_group_members(student_id);
create index if not exists idx_sgm_status
    on public.study_group_members(group_id, status);


-- -------------------------------------------------------
-- study_group_messages
-- chat messages inside a study group
-- -------------------------------------------------------
create table if not exists public.study_group_messages (
    id           uuid        not null default uuid_generate_v4(),
    group_id     uuid        not null,
    sender_id    uuid        not null,
    body         text,
    is_pinned    boolean     not null default false,
    created_at   timestamptz not null default now(),

    constraint pk_study_group_messages
        primary key (id),
    constraint fk_sgmsg_group
        foreign key (group_id)
        references public.study_groups(id)
        on delete cascade,
    constraint fk_sgmsg_sender
        foreign key (sender_id)
        references public.users(id)
        on delete restrict,
    constraint chk_sgmsg_has_content
        check (body is not null)
);

create index if not exists idx_sgmsg_group
    on public.study_group_messages(group_id);
create index if not exists idx_sgmsg_sender
    on public.study_group_messages(sender_id);
create index if not exists idx_sgmsg_created_at
    on public.study_group_messages(group_id, created_at);


-- -------------------------------------------------------
-- study_group_attachments
-- files shared inside group messages
-- reuses existing public.attachments table
-- -------------------------------------------------------
create table if not exists public.study_group_attachments (
    id            uuid        not null default uuid_generate_v4(),
    message_id    uuid        not null,
    attachment_id uuid        not null,
    created_at    timestamptz not null default now(),

    constraint pk_study_group_attachments
        primary key (id),
    constraint uq_study_group_attachments
        unique (message_id, attachment_id),
    constraint fk_sga_message
        foreign key (message_id)
        references public.study_group_messages(id)
        on delete cascade,
    constraint fk_sga_attachment
        foreign key (attachment_id)
        references public.attachments(id)
        on delete cascade
);

create index if not exists idx_sga_message
    on public.study_group_attachments(message_id);
create index if not exists idx_sga_attachment
    on public.study_group_attachments(attachment_id);
