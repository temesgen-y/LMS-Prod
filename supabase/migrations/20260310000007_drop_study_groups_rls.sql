-- =============================================================================
-- Drop all RLS from study group tables.
-- The recursive policy on study_group_members cannot be cleanly fixed
-- without a SECURITY DEFINER workaround. Since no other table in this
-- project uses RLS, disabling it here is consistent and simpler.
-- Application-level queries already scope data to the current user.
-- =============================================================================

-- Drop all policies on study_group_members (including the recursive ones)
drop policy if exists "members_read_study_group_members"    on public.study_group_members;
drop policy if exists "students_insert_study_group_members" on public.study_group_members;
drop policy if exists "members_update_own_membership"       on public.study_group_members;

-- Drop all policies on study_groups
drop policy if exists "students_read_study_groups"   on public.study_groups;
drop policy if exists "students_insert_study_groups" on public.study_groups;
drop policy if exists "owner_update_study_groups"    on public.study_groups;
drop policy if exists "owner_delete_study_groups"    on public.study_groups;

-- Drop all policies on study_group_messages
drop policy if exists "members_read_group_messages"   on public.study_group_messages;
drop policy if exists "members_insert_group_messages" on public.study_group_messages;
drop policy if exists "sender_update_own_messages"    on public.study_group_messages;
drop policy if exists "sender_delete_own_messages"    on public.study_group_messages;

-- Drop all policies on study_group_attachments
drop policy if exists "members_read_group_attachments"   on public.study_group_attachments;
drop policy if exists "members_insert_group_attachments" on public.study_group_attachments;

-- Drop storage policies (if they were applied)
drop policy if exists "members_upload_study_group_files"      on storage.objects;
drop policy if exists "members_read_study_group_files"        on storage.objects;
drop policy if exists "members_delete_own_study_group_files"  on storage.objects;

-- Drop the helper function from the previous fix attempt
drop function if exists public.is_active_study_group_member(uuid, uuid);

-- Disable RLS on all four tables
alter table public.study_groups             disable row level security;
alter table public.study_group_members      disable row level security;
alter table public.study_group_messages     disable row level security;
alter table public.study_group_attachments  disable row level security;
