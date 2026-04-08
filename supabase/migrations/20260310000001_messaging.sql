-- =============================================================================
--  messaging feature
--  tables: conversations, messages, message_attachments
--  run after lmsv6.sql
-- =============================================================================

-- ── conversations ─────────────────────────────────────────────────────────────
-- one row per student ↔ instructor pair per offering

create table if not exists public.conversations (
    id              uuid        not null default uuid_generate_v4(),
    offering_id     uuid        not null,
    student_id      uuid        not null,
    instructor_id   uuid        not null,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    constraint pk_conversations
        primary key (id),
    constraint uq_conversations
        unique (offering_id, student_id, instructor_id),
    constraint fk_conversations_offering
        foreign key (offering_id)
        references public.course_offerings(id) on delete cascade,
    constraint fk_conversations_student
        foreign key (student_id)
        references public.users(id) on delete cascade,
    constraint fk_conversations_instructor
        foreign key (instructor_id)
        references public.users(id) on delete cascade
);

create index if not exists idx_conversations_student
    on public.conversations(student_id);
create index if not exists idx_conversations_instructor
    on public.conversations(instructor_id);
create index if not exists idx_conversations_offering
    on public.conversations(offering_id);

create or replace trigger trg_conversations_updated_at
    before update on public.conversations
    for each row execute function public.set_updated_at();


-- ── messages ──────────────────────────────────────────────────────────────────
-- one row per message inside a conversation

create table if not exists public.messages (
    id              uuid        not null default uuid_generate_v4(),
    conversation_id uuid        not null,
    sender_id       uuid        not null,
    body            text,
    is_read         boolean     not null default false,
    read_at         timestamptz,
    created_at      timestamptz not null default now(),

    constraint pk_messages
        primary key (id),
    constraint fk_messages_conversation
        foreign key (conversation_id)
        references public.conversations(id) on delete cascade,
    constraint fk_messages_sender
        foreign key (sender_id)
        references public.users(id) on delete restrict,
    constraint chk_messages_read
        check (
            (is_read = false and read_at is null)
            or
            (is_read = true  and read_at is not null)
        )
);

create index if not exists idx_messages_conversation
    on public.messages(conversation_id);
create index if not exists idx_messages_sender
    on public.messages(sender_id);
create index if not exists idx_messages_unread
    on public.messages(conversation_id)
    where is_read = false;


-- ── message_attachments ───────────────────────────────────────────────────────
-- files attached to messages — links messages to the existing attachments table

create table if not exists public.message_attachments (
    id            uuid        not null default uuid_generate_v4(),
    message_id    uuid        not null,
    attachment_id uuid        not null,
    created_at    timestamptz not null default now(),

    constraint pk_message_attachments
        primary key (id),
    constraint uq_message_attachments
        unique (message_id, attachment_id),
    constraint fk_message_attachments_message
        foreign key (message_id)
        references public.messages(id) on delete cascade,
    constraint fk_message_attachments_attachment
        foreign key (attachment_id)
        references public.attachments(id) on delete cascade
);

create index if not exists idx_message_attachments_message
    on public.message_attachments(message_id);


-- ── realtime ──────────────────────────────────────────────────────────────────

alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.messages;
