-- =============================================================================
-- Study Groups — RLS policies
-- Instructors and admins cannot access group chat content.
-- =============================================================================

alter table public.study_groups         enable row level security;
alter table public.study_group_members  enable row level security;
alter table public.study_group_messages enable row level security;
alter table public.study_group_attachments enable row level security;


-- -----------------------------------------------------------------------------
-- STUDY_GROUPS
-- -----------------------------------------------------------------------------

create policy "students_read_study_groups"
on public.study_groups for select
to authenticated
using (
    offering_id in (
        select offering_id from public.enrollments
        where student_id = (
            select id from public.users where auth_user_id = auth.uid()
        )
        and status = 'active'
    )
);

create policy "students_insert_study_groups"
on public.study_groups for insert
to authenticated
with check (
    created_by = (
        select id from public.users where auth_user_id = auth.uid()
    )
    and offering_id in (
        select offering_id from public.enrollments
        where student_id = (
            select id from public.users where auth_user_id = auth.uid()
        )
        and status = 'active'
    )
);

create policy "owner_update_study_groups"
on public.study_groups for update
to authenticated
using (
    created_by = (
        select id from public.users where auth_user_id = auth.uid()
    )
);

create policy "owner_delete_study_groups"
on public.study_groups for delete
to authenticated
using (
    created_by = (
        select id from public.users where auth_user_id = auth.uid()
    )
);


-- -----------------------------------------------------------------------------
-- STUDY_GROUP_MEMBERS
-- -----------------------------------------------------------------------------

create policy "members_read_study_group_members"
on public.study_group_members for select
to authenticated
using (
    group_id in (
        select group_id from public.study_group_members
        where student_id = (
            select id from public.users where auth_user_id = auth.uid()
        )
        and status = 'active'
    )
);

create policy "students_insert_study_group_members"
on public.study_group_members for insert
to authenticated
with check (
    (
        invited_by = (
            select id from public.users where auth_user_id = auth.uid()
        )
        and invited_by in (
            select student_id from public.study_group_members
            where group_id = study_group_members.group_id
              and role = 'owner'
              and status = 'active'
        )
    )
    or
    (
        student_id = (
            select id from public.users where auth_user_id = auth.uid()
        )
    )
);

create policy "members_update_own_membership"
on public.study_group_members for update
to authenticated
using (
    student_id = (
        select id from public.users where auth_user_id = auth.uid()
    )
);


-- -----------------------------------------------------------------------------
-- STUDY_GROUP_MESSAGES
-- -----------------------------------------------------------------------------

create policy "members_read_group_messages"
on public.study_group_messages for select
to authenticated
using (
    group_id in (
        select group_id from public.study_group_members
        where student_id = (
            select id from public.users where auth_user_id = auth.uid()
        )
        and status = 'active'
    )
);

create policy "members_insert_group_messages"
on public.study_group_messages for insert
to authenticated
with check (
    sender_id = (
        select id from public.users where auth_user_id = auth.uid()
    )
    and group_id in (
        select group_id from public.study_group_members
        where student_id = (
            select id from public.users where auth_user_id = auth.uid()
        )
        and status = 'active'
    )
);

create policy "sender_update_own_messages"
on public.study_group_messages for update
to authenticated
using (
    sender_id = (
        select id from public.users where auth_user_id = auth.uid()
    )
);

create policy "sender_delete_own_messages"
on public.study_group_messages for delete
to authenticated
using (
    sender_id = (
        select id from public.users where auth_user_id = auth.uid()
    )
);


-- -----------------------------------------------------------------------------
-- STUDY_GROUP_ATTACHMENTS
-- -----------------------------------------------------------------------------

create policy "members_read_group_attachments"
on public.study_group_attachments for select
to authenticated
using (
    message_id in (
        select id from public.study_group_messages
        where group_id in (
            select group_id from public.study_group_members
            where student_id = (
                select id from public.users where auth_user_id = auth.uid()
            )
            and status = 'active'
        )
    )
);

create policy "members_insert_group_attachments"
on public.study_group_attachments for insert
to authenticated
with check (
    message_id in (
        select id from public.study_group_messages
        where sender_id = (
            select id from public.users where auth_user_id = auth.uid()
        )
    )
);


-- -----------------------------------------------------------------------------
-- STORAGE — bucket: lms-uploads, path prefix: study-groups/
-- -----------------------------------------------------------------------------

create policy "members_upload_study_group_files"
on storage.objects for insert
to authenticated
with check (
    bucket_id = 'lms-uploads'
    and (storage.foldername(name))[1] = 'study-groups'
);

create policy "members_read_study_group_files"
on storage.objects for select
to authenticated
using (
    bucket_id = 'lms-uploads'
    and (storage.foldername(name))[1] = 'study-groups'
);

create policy "members_delete_own_study_group_files"
on storage.objects for delete
to authenticated
using (
    bucket_id = 'lms-uploads'
    and owner = auth.uid()
);
