-- ============================================================
-- Student Academic Profile & Registrar Student Management
-- RLS Policies (Section A)
-- ============================================================

-- student reads own profile
drop policy if exists "student_read_own_profile" on public.student_profiles;
create policy "student_read_own_profile"
on public.student_profiles for select
to authenticated
using (
    user_id = (
        select id from public.users
        where auth_user_id = auth.uid()
    )
);

-- student reads own academic standing
drop policy if exists "student_read_own_standing" on public.academic_standing;
create policy "student_read_own_standing"
on public.academic_standing for select
to authenticated
using (
    student_id = (
        select id from public.users
        where auth_user_id = auth.uid()
    )
);

-- student reads own enrollments
drop policy if exists "student_read_own_enrollments" on public.enrollments;
create policy "student_read_own_enrollments"
on public.enrollments for select
to authenticated
using (
    student_id = (
        select id from public.users
        where auth_user_id = auth.uid()
    )
);

-- student reads own fee accounts
drop policy if exists "student_read_own_fee_account" on public.student_fee_accounts;
create policy "student_read_own_fee_account"
on public.student_fee_accounts for select
to authenticated
using (
    student_id = (
        select id from public.users
        where auth_user_id = auth.uid()
    )
);

-- student reads own payments
drop policy if exists "student_read_own_payments" on public.payments;
create policy "student_read_own_payments"
on public.payments for select
to authenticated
using (
    student_id = (
        select id from public.users
        where auth_user_id = auth.uid()
    )
);

-- everyone reads academic programs
drop policy if exists "all_read_academic_programs" on public.academic_programs;
create policy "all_read_academic_programs"
on public.academic_programs for select
to authenticated
using (true);

-- everyone reads courses
drop policy if exists "all_read_courses" on public.courses;
create policy "all_read_courses"
on public.courses for select
to authenticated
using (true);

-- everyone reads academic terms
drop policy if exists "all_read_academic_terms" on public.academic_terms;
create policy "all_read_academic_terms"
on public.academic_terms for select
to authenticated
using (true);

-- everyone reads departments
drop policy if exists "all_read_departments" on public.departments;
create policy "all_read_departments"
on public.departments for select
to authenticated
using (true);

-- everyone reads degree requirements
drop policy if exists "all_read_degree_requirements" on public.degree_requirements;
create policy "all_read_degree_requirements"
on public.degree_requirements for select
to authenticated
using (true);

-- registrar reads all student profiles
drop policy if exists "registrar_read_all_student_profiles" on public.student_profiles;
create policy "registrar_read_all_student_profiles"
on public.student_profiles for select
to authenticated
using (
    exists (
        select 1 from public.users
        where auth_user_id = auth.uid()
          and role in ('registrar','admin')
    )
);

-- registrar reads all academic standing
drop policy if exists "registrar_read_all_standing" on public.academic_standing;
create policy "registrar_read_all_standing"
on public.academic_standing for select
to authenticated
using (
    exists (
        select 1 from public.users
        where auth_user_id = auth.uid()
          and role in ('registrar','admin')
    )
);

-- registrar inserts academic standing
drop policy if exists "registrar_insert_standing" on public.academic_standing;
create policy "registrar_insert_standing"
on public.academic_standing for insert
to authenticated
with check (
    exists (
        select 1 from public.users
        where auth_user_id = auth.uid()
          and role in ('registrar','admin')
    )
);

-- registrar updates academic standing
drop policy if exists "registrar_update_standing" on public.academic_standing;
create policy "registrar_update_standing"
on public.academic_standing for update
to authenticated
using (
    exists (
        select 1 from public.users
        where auth_user_id = auth.uid()
          and role in ('registrar','admin')
    )
);

-- registrar reads all enrollments
drop policy if exists "registrar_read_all_enrollments" on public.enrollments;
create policy "registrar_read_all_enrollments"
on public.enrollments for select
to authenticated
using (
    exists (
        select 1 from public.users
        where auth_user_id = auth.uid()
          and role in ('registrar','admin')
    )
);

-- registrar reads all fee accounts
drop policy if exists "registrar_read_all_fee_accounts" on public.student_fee_accounts;
create policy "registrar_read_all_fee_accounts"
on public.student_fee_accounts for all
to authenticated
using (
    exists (
        select 1 from public.users
        where auth_user_id = auth.uid()
          and role in ('registrar','admin')
    )
);

-- registrar reads all payments
drop policy if exists "registrar_read_all_payments" on public.payments;
create policy "registrar_read_all_payments"
on public.payments for all
to authenticated
using (
    exists (
        select 1 from public.users
        where auth_user_id = auth.uid()
          and role in ('registrar','admin')
    )
);
