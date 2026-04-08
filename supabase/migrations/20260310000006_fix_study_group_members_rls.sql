-- =============================================================================
-- Fix: infinite recursion in study_group_members RLS policies.
--
-- Problem: the SELECT and INSERT policies on study_group_members both
-- subquery study_group_members itself, triggering PostgreSQL's recursion
-- guard.
--
-- Fix A (SELECT): create a SECURITY DEFINER function that bypasses RLS
--   when checking membership, so the policy no longer recurses.
--
-- Fix B (INSERT): replace the owner-via-members subquery with a direct
--   check against study_groups.created_by, eliminating the self-reference.
-- =============================================================================


-- ── Fix A: SECURITY DEFINER helper ──────────────────────────────────────────

create or replace function public.is_active_study_group_member(
    p_group_id  uuid,
    p_user_id   uuid
)
returns boolean
language sql
security definer          -- runs as the function owner, bypasses RLS
set search_path = public  -- prevents search-path injection
stable
as $$
    select exists (
        select 1
        from public.study_group_members
        where group_id   = p_group_id
          and student_id = p_user_id
          and status     = 'active'
    );
$$;


-- ── Fix A: replace recursive SELECT policy ───────────────────────────────────

drop policy if exists "members_read_study_group_members"
    on public.study_group_members;

create policy "members_read_study_group_members"
on public.study_group_members for select
to authenticated
using (
    public.is_active_study_group_member(
        group_id,
        (select id from public.users where auth_user_id = auth.uid())
    )
);


-- ── Fix B: replace recursive INSERT policy ───────────────────────────────────
-- Owner check now uses study_groups.created_by instead of a self-subquery.

drop policy if exists "students_insert_study_group_members"
    on public.study_group_members;

create policy "students_insert_study_group_members"
on public.study_group_members for insert
to authenticated
with check (
    -- Case 1: inviting someone — caller must be the group creator (owner)
    (
        invited_by = (
            select id from public.users where auth_user_id = auth.uid()
        )
        and invited_by = (
            select created_by from public.study_groups
            where id = study_group_members.group_id
        )
    )
    or
    -- Case 2: self-join — student is inserting their own row
    (
        student_id = (
            select id from public.users where auth_user_id = auth.uid()
        )
    )
);
