-- A1. Update users role constraint
-- Drop all existing role/status check constraints (including auto-named ones)
alter table public.users drop constraint if exists chk_users_role;
alter table public.users drop constraint if exists users_role_check;
alter table public.users drop constraint if exists users_status_check;

-- Normalize role and status values (fix any uppercase/trimming issues)
update public.users set role = lower(trim(role)) where role is not null;
update public.users set status = lower(trim(status)) where status is not null;
update public.users set role = 'student'
    where role not in ('admin','instructor','student','registrar','academic_advisor','department_head','it_admin')
       or role is null;
update public.users set status = 'active'
    where status not in ('active','inactive','suspended','pending')
       or status is null;

alter table public.users
    add constraint chk_users_role check (
        role in ('admin','instructor','student','registrar','academic_advisor','department_head','it_admin')
    );

-- A2. New actor profile tables
create table if not exists public.registrar_profiles (
    id uuid not null default uuid_generate_v4(),
    user_id uuid not null,
    staff_no text,
    department text,
    profile_status text not null default 'active',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    created_by uuid not null,
    constraint pk_registrar_profiles primary key (id),
    constraint uq_registrar_profiles_user unique (user_id),
    constraint fk_rp_user foreign key (user_id) references public.users(id) on delete cascade,
    constraint fk_rp_created_by foreign key (created_by) references public.users(id),
    constraint chk_rp_status check (profile_status in ('active','inactive'))
);

create table if not exists public.department_head_profiles (
    id uuid not null default uuid_generate_v4(),
    user_id uuid not null,
    department_id uuid not null,
    staff_no text,
    profile_status text not null default 'active',
    appointed_at date,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    created_by uuid not null,
    constraint pk_dhp primary key (id),
    constraint uq_dhp_user unique (user_id),
    constraint fk_dhp_user foreign key (user_id) references public.users(id) on delete cascade,
    constraint fk_dhp_dept foreign key (department_id) references public.departments(id)
);

create table if not exists public.academic_advisor_profiles (
    id uuid not null default uuid_generate_v4(),
    user_id uuid not null,
    staff_no text,
    department_id uuid,
    specialization text,
    max_advisees smallint default 30,
    profile_status text not null default 'active',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    created_by uuid not null,
    constraint pk_aap primary key (id),
    constraint uq_aap_user unique (user_id),
    constraint fk_aap_user foreign key (user_id) references public.users(id) on delete cascade
);

create table if not exists public.it_admin_profiles (
    id uuid not null default uuid_generate_v4(),
    user_id uuid not null,
    staff_no text,
    access_level text not null default 'standard',
    profile_status text not null default 'active',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    created_by uuid not null,
    constraint pk_iap primary key (id),
    constraint uq_iap_user unique (user_id),
    constraint fk_iap_user foreign key (user_id) references public.users(id) on delete cascade,
    constraint chk_iap_access check (access_level in ('standard','super'))
);

-- A3. Registration module tables
create table if not exists public.course_prerequisites (
    id uuid not null default uuid_generate_v4(),
    course_id uuid not null,
    prerequisite_id uuid not null,
    min_grade text default 'D',
    prerequisite_type text not null default 'hard',
    created_at timestamptz not null default now(),
    constraint pk_cp primary key (id),
    constraint uq_cp unique (course_id, prerequisite_id),
    constraint chk_cp_no_self check (course_id != prerequisite_id),
    constraint fk_cp_course foreign key (course_id) references public.courses(id) on delete cascade,
    constraint fk_cp_prereq foreign key (prerequisite_id) references public.courses(id) on delete cascade,
    constraint chk_cp_type check (prerequisite_type in ('hard','soft','corequisite','antirequisite'))
);

create table if not exists public.registration_requests (
    id uuid not null default uuid_generate_v4(),
    student_id uuid not null,
    offering_id uuid not null,
    term_id uuid not null,
    request_type text not null default 'registration',
    status text not null default 'pending',
    reason text,
    prereq_override boolean not null default false,
    override_reason text,
    reviewed_by uuid,
    reviewed_at timestamptz,
    rejection_note text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint pk_rr primary key (id),
    constraint uq_rr unique (student_id, offering_id, term_id),
    constraint fk_rr_student foreign key (student_id) references public.users(id),
    constraint fk_rr_offering foreign key (offering_id) references public.course_offerings(id),
    constraint fk_rr_term foreign key (term_id) references public.academic_terms(id),
    constraint fk_rr_reviewer foreign key (reviewed_by) references public.users(id) on delete set null,
    constraint chk_rr_type check (request_type in ('registration','add','drop','withdrawal','audit')),
    constraint chk_rr_status check (status in ('pending','approved','rejected','cancelled','under_review'))
);

create table if not exists public.withdrawal_requests (
    id uuid not null default uuid_generate_v4(),
    student_id uuid not null,
    offering_id uuid not null,
    reason text not null,
    reason_category text not null,
    supporting_doc text,
    status text not null default 'pending',
    grade_impact text default 'W',
    reviewed_by uuid,
    reviewed_at timestamptz,
    review_note text,
    effective_date date,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint pk_wr primary key (id),
    constraint fk_wr_student foreign key (student_id) references public.users(id),
    constraint fk_wr_offering foreign key (offering_id) references public.course_offerings(id),
    constraint fk_wr_reviewer foreign key (reviewed_by) references public.users(id) on delete set null,
    constraint chk_wr_category check (reason_category in ('medical','financial','personal','academic','military','other')),
    constraint chk_wr_status check (status in ('pending','approved','rejected','cancelled'))
);

create table if not exists public.readmission_requests (
    id uuid not null default uuid_generate_v4(),
    student_id uuid not null,
    term_requested uuid not null,
    reason text not null,
    gap_explanation text not null,
    supporting_docs text[],
    status text not null default 'pending',
    reviewed_by uuid,
    reviewed_at timestamptz,
    decision_note text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint pk_rar primary key (id),
    constraint fk_rar_student foreign key (student_id) references public.users(id),
    constraint fk_rar_term foreign key (term_requested) references public.academic_terms(id),
    constraint fk_rar_reviewer foreign key (reviewed_by) references public.users(id) on delete set null,
    constraint chk_rar_status check (status in ('pending','approved','rejected','under_review','deferred'))
);

create table if not exists public.clearance_requests (
    id uuid not null default uuid_generate_v4(),
    student_id uuid not null,
    clearance_type text not null,
    status text not null default 'pending',
    library_cleared boolean not null default false,
    dept_cleared boolean not null default false,
    registrar_cleared boolean not null default false,
    notes text,
    completed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint pk_cr primary key (id),
    constraint fk_cr_student foreign key (student_id) references public.users(id),
    constraint chk_cr_type check (clearance_type in ('graduation','withdrawal','transfer','annual')),
    constraint chk_cr_status check (status in ('pending','in_progress','cleared','rejected'))
);

-- A4. Fee module tables
create table if not exists public.fee_structures (
    id uuid not null default uuid_generate_v4(),
    term_id uuid not null,
    program_id uuid,
    degree_level text not null,
    fee_type text not null,
    amount decimal(12,2) not null,
    currency text not null default 'ETB',
    is_active boolean not null default true,
    created_by uuid not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint pk_fs primary key (id),
    constraint fk_fs_term foreign key (term_id) references public.academic_terms(id),
    constraint fk_fs_created_by foreign key (created_by) references public.users(id),
    constraint chk_fs_fee_type check (fee_type in ('tuition','registration','lab','library','exam','other'))
);

create table if not exists public.student_fee_accounts (
    id uuid not null default uuid_generate_v4(),
    student_id uuid not null,
    term_id uuid not null,
    total_amount decimal(12,2) not null default 0,
    paid_amount decimal(12,2) not null default 0,
    balance decimal(12,2) not null default 0,
    status text not null default 'unpaid',
    due_date date,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint pk_sfa primary key (id),
    constraint uq_sfa unique (student_id, term_id),
    constraint fk_sfa_student foreign key (student_id) references public.users(id),
    constraint fk_sfa_term foreign key (term_id) references public.academic_terms(id),
    constraint chk_sfa_status check (status in ('paid','unpaid','partial','waived','overdue'))
);

create table if not exists public.payments (
    id uuid not null default uuid_generate_v4(),
    student_id uuid not null,
    term_id uuid not null,
    amount decimal(12,2) not null,
    payment_method text not null,
    reference_no text,
    recorded_by uuid not null,
    payment_date date not null default current_date,
    notes text,
    created_at timestamptz not null default now(),
    constraint pk_payments primary key (id),
    constraint fk_pay_student foreign key (student_id) references public.users(id),
    constraint fk_pay_term foreign key (term_id) references public.academic_terms(id),
    constraint fk_pay_recorded_by foreign key (recorded_by) references public.users(id),
    constraint chk_pay_method check (payment_method in ('bank_transfer','cash','online','scholarship','waiver','other'))
);

-- A5. Leave module tables
create table if not exists public.leave_policies (
    id uuid not null default uuid_generate_v4(),
    leave_type text not null,
    days_per_year smallint not null,
    carry_forward boolean not null default false,
    max_carry_days smallint default 0,
    applies_to text not null default 'instructor',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint pk_lp primary key (id),
    constraint uq_lp unique (leave_type, applies_to),
    constraint chk_lp_type check (leave_type in ('annual','sick','emergency','maternity','paternity','study','unpaid'))
);

create table if not exists public.leave_balances (
    id uuid not null default uuid_generate_v4(),
    user_id uuid not null,
    academic_year text not null,
    leave_type text not null,
    total_days smallint not null default 0,
    used_days smallint not null default 0,
    remaining_days smallint not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint pk_lb primary key (id),
    constraint uq_lb unique (user_id, academic_year, leave_type),
    constraint fk_lb_user foreign key (user_id) references public.users(id) on delete cascade
);

create table if not exists public.leave_requests (
    id uuid not null default uuid_generate_v4(),
    requester_id uuid not null,
    leave_type text not null,
    start_date date not null,
    end_date date not null,
    total_days smallint not null,
    reason text not null,
    supporting_doc text,
    coverage_plan text,
    status text not null default 'pending',
    reviewed_by uuid,
    reviewed_at timestamptz,
    review_note text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint pk_lr primary key (id),
    constraint fk_lr_requester foreign key (requester_id) references public.users(id),
    constraint fk_lr_reviewer foreign key (reviewed_by) references public.users(id) on delete set null,
    constraint chk_lr_type check (leave_type in ('annual','sick','emergency','maternity','paternity','study','unpaid')),
    constraint chk_lr_status check (status in ('pending','approved','rejected','cancelled','under_review')),
    constraint chk_lr_dates check (end_date >= start_date)
);

-- A6. Grading enhancement
create table if not exists public.grade_change_log (
    id uuid not null default uuid_generate_v4(),
    enrollment_id uuid not null,
    changed_by uuid not null,
    assessment_id uuid,
    assignment_id uuid,
    old_score decimal(5,2),
    new_score decimal(5,2) not null,
    reason text not null,
    created_at timestamptz not null default now(),
    constraint pk_gcl primary key (id),
    constraint fk_gcl_enrollment foreign key (enrollment_id) references public.enrollments(id),
    constraint fk_gcl_changed_by foreign key (changed_by) references public.users(id)
);

create table if not exists public.regrade_requests (
    id uuid not null default uuid_generate_v4(),
    student_id uuid not null,
    enrollment_id uuid not null,
    assessment_id uuid,
    assignment_id uuid,
    current_score decimal(5,2) not null,
    reason text not null,
    status text not null default 'pending',
    reviewed_by uuid,
    reviewed_at timestamptz,
    final_score decimal(5,2),
    review_note text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint pk_rer primary key (id),
    constraint fk_rer_student foreign key (student_id) references public.users(id),
    constraint fk_rer_enrollment foreign key (enrollment_id) references public.enrollments(id),
    constraint chk_rer_status check (status in ('pending','under_review','approved','rejected','closed'))
);

-- A7. Course plan
create table if not exists public.course_outlines (
    id uuid not null default uuid_generate_v4(),
    offering_id uuid not null,
    created_by uuid not null,
    overview text,
    learning_outcomes text[],
    required_texts text[],
    weekly_schedule jsonb,
    policies text,
    is_published boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint pk_cout primary key (id),
    constraint uq_cout_offering unique (offering_id),
    constraint fk_cout_offering foreign key (offering_id) references public.course_offerings(id) on delete cascade,
    constraint fk_cout_created_by foreign key (created_by) references public.users(id)
);

-- A8. Academic calendar
create table if not exists public.academic_calendar (
    id uuid not null default uuid_generate_v4(),
    term_id uuid not null,
    event_name text not null,
    event_type text not null,
    event_date date not null,
    end_date date,
    description text,
    applies_to text not null default 'all',
    created_by uuid not null,
    created_at timestamptz not null default now(),
    constraint pk_acal primary key (id),
    constraint fk_acal_term foreign key (term_id) references public.academic_terms(id),
    constraint fk_acal_created_by foreign key (created_by) references public.users(id),
    constraint chk_acal_type check (event_type in ('registration_start','registration_end','classes_start','classes_end','add_drop_deadline','withdrawal_deadline','exam_start','exam_end','grade_submission_deadline','holiday','graduation','other'))
);

-- A9. Academic standing
create table if not exists public.academic_standing (
    id uuid not null default uuid_generate_v4(),
    student_id uuid not null,
    term_id uuid not null,
    gpa decimal(4,2) not null,
    cumulative_gpa decimal(4,2) not null,
    standing text not null default 'good',
    credits_earned smallint not null default 0,
    credits_attempted smallint not null default 0,
    notes text,
    recorded_by uuid,
    created_at timestamptz not null default now(),
    constraint pk_acs primary key (id),
    constraint uq_acs unique (student_id, term_id),
    constraint fk_acs_student foreign key (student_id) references public.users(id),
    constraint fk_acs_term foreign key (term_id) references public.academic_terms(id),
    constraint chk_acs_standing check (standing in ('good','warning','probation','suspension','dismissed','honors'))
);

-- A10. Advisor module
create table if not exists public.advisor_assignments (
    id uuid not null default uuid_generate_v4(),
    advisor_id uuid not null,
    student_id uuid not null,
    assigned_at timestamptz not null default now(),
    assigned_by uuid not null,
    is_active boolean not null default true,
    constraint pk_aa primary key (id),
    constraint uq_aa unique (advisor_id, student_id),
    constraint fk_aa_advisor foreign key (advisor_id) references public.users(id),
    constraint fk_aa_student foreign key (student_id) references public.users(id),
    constraint fk_aa_assigned_by foreign key (assigned_by) references public.users(id)
);

create table if not exists public.advisor_appointments (
    id uuid not null default uuid_generate_v4(),
    advisor_id uuid not null,
    student_id uuid not null,
    scheduled_at timestamptz not null,
    duration_mins smallint not null default 30,
    purpose text not null,
    status text not null default 'scheduled',
    notes text,
    meeting_url text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint pk_apt primary key (id),
    constraint fk_apt_advisor foreign key (advisor_id) references public.users(id),
    constraint fk_apt_student foreign key (student_id) references public.users(id),
    constraint chk_apt_status check (status in ('scheduled','completed','cancelled','no_show'))
);

create table if not exists public.degree_requirements (
    id uuid not null default uuid_generate_v4(),
    program_id uuid not null,
    course_id uuid not null,
    requirement_type text not null default 'core',
    min_grade text default 'D',
    semester_recommended smallint,
    created_at timestamptz not null default now(),
    constraint pk_dr primary key (id),
    constraint uq_dr unique (program_id, course_id),
    constraint fk_dr_program foreign key (program_id) references public.academic_programs(id),
    constraint fk_dr_course foreign key (course_id) references public.courses(id),
    constraint chk_dr_type check (requirement_type in ('core','elective','lab','thesis','internship'))
);

-- A11. Password change log
create table if not exists public.password_change_log (
    id uuid not null default uuid_generate_v4(),
    user_id uuid not null,
    changed_at timestamptz not null default now(),
    changed_by uuid not null,
    ip_address text,
    constraint pk_pcl primary key (id),
    constraint fk_pcl_user foreign key (user_id) references public.users(id) on delete cascade,
    constraint fk_pcl_changed_by foreign key (changed_by) references public.users(id)
);

-- A12. RLS Policies
drop policy if exists "registrar_read_reg_requests" on public.registration_requests;
create policy "registrar_read_reg_requests" on public.registration_requests for select to authenticated
using (exists (select 1 from public.users where auth_user_id = auth.uid() and role in ('registrar','admin')));

drop policy if exists "registrar_update_reg_requests" on public.registration_requests;
create policy "registrar_update_reg_requests" on public.registration_requests for update to authenticated
using (exists (select 1 from public.users where auth_user_id = auth.uid() and role in ('registrar','admin')));

drop policy if exists "student_read_own_reg_requests" on public.registration_requests;
create policy "student_read_own_reg_requests" on public.registration_requests for select to authenticated
using (student_id = (select id from public.users where auth_user_id = auth.uid()));

drop policy if exists "student_insert_reg_requests" on public.registration_requests;
create policy "student_insert_reg_requests" on public.registration_requests for insert to authenticated
with check (student_id = (select id from public.users where auth_user_id = auth.uid()));

drop policy if exists "registrar_manage_withdrawals" on public.withdrawal_requests;
create policy "registrar_manage_withdrawals" on public.withdrawal_requests for all to authenticated
using (exists (select 1 from public.users where auth_user_id = auth.uid() and role in ('registrar','admin')));

drop policy if exists "student_read_own_withdrawals" on public.withdrawal_requests;
create policy "student_read_own_withdrawals" on public.withdrawal_requests for select to authenticated
using (student_id = (select id from public.users where auth_user_id = auth.uid()));

drop policy if exists "student_insert_withdrawals" on public.withdrawal_requests;
create policy "student_insert_withdrawals" on public.withdrawal_requests for insert to authenticated
with check (student_id = (select id from public.users where auth_user_id = auth.uid()));

drop policy if exists "registrar_manage_readmissions" on public.readmission_requests;
create policy "registrar_manage_readmissions" on public.readmission_requests for all to authenticated
using (exists (select 1 from public.users where auth_user_id = auth.uid() and role in ('registrar','admin')));

drop policy if exists "student_read_own_readmissions" on public.readmission_requests;
create policy "student_read_own_readmissions" on public.readmission_requests for select to authenticated
using (student_id = (select id from public.users where auth_user_id = auth.uid()));

drop policy if exists "student_insert_readmissions" on public.readmission_requests;
create policy "student_insert_readmissions" on public.readmission_requests for insert to authenticated
with check (student_id = (select id from public.users where auth_user_id = auth.uid()));

drop policy if exists "registrar_manage_clearance" on public.clearance_requests;
create policy "registrar_manage_clearance" on public.clearance_requests for all to authenticated
using (exists (select 1 from public.users where auth_user_id = auth.uid() and role in ('registrar','admin')));

drop policy if exists "student_read_own_clearance" on public.clearance_requests;
create policy "student_read_own_clearance" on public.clearance_requests for select to authenticated
using (student_id = (select id from public.users where auth_user_id = auth.uid()));

drop policy if exists "student_insert_clearance" on public.clearance_requests;
create policy "student_insert_clearance" on public.clearance_requests for insert to authenticated
with check (student_id = (select id from public.users where auth_user_id = auth.uid()));

drop policy if exists "read_course_prerequisites" on public.course_prerequisites;
create policy "read_course_prerequisites" on public.course_prerequisites for select to authenticated using (true);

drop policy if exists "admin_manage_prerequisites" on public.course_prerequisites;
create policy "admin_manage_prerequisites" on public.course_prerequisites for all to authenticated
using (exists (select 1 from public.users where auth_user_id = auth.uid() and role in ('admin','registrar')));

drop policy if exists "registrar_manage_fee_accounts" on public.student_fee_accounts;
create policy "registrar_manage_fee_accounts" on public.student_fee_accounts for all to authenticated
using (exists (select 1 from public.users where auth_user_id = auth.uid() and role in ('registrar','admin')));

drop policy if exists "student_read_own_fee_account" on public.student_fee_accounts;
create policy "student_read_own_fee_account" on public.student_fee_accounts for select to authenticated
using (student_id = (select id from public.users where auth_user_id = auth.uid()));

drop policy if exists "registrar_manage_payments" on public.payments;
create policy "registrar_manage_payments" on public.payments for all to authenticated
using (exists (select 1 from public.users where auth_user_id = auth.uid() and role in ('registrar','admin')));

drop policy if exists "instructor_manage_own_leave" on public.leave_requests;
create policy "instructor_manage_own_leave" on public.leave_requests for all to authenticated
using (requester_id = (select id from public.users where auth_user_id = auth.uid()));

drop policy if exists "dept_head_manage_leave" on public.leave_requests;
create policy "dept_head_manage_leave" on public.leave_requests for all to authenticated
using (exists (select 1 from public.users where auth_user_id = auth.uid() and role in ('department_head','admin')));

drop policy if exists "read_own_leave_balances" on public.leave_balances;
create policy "read_own_leave_balances" on public.leave_balances for select to authenticated
using (user_id = (select id from public.users where auth_user_id = auth.uid()));

drop policy if exists "dept_head_read_leave_balances" on public.leave_balances;
create policy "dept_head_read_leave_balances" on public.leave_balances for all to authenticated
using (exists (select 1 from public.users where auth_user_id = auth.uid() and role in ('department_head','admin')));

drop policy if exists "all_read_academic_calendar" on public.academic_calendar;
create policy "all_read_academic_calendar" on public.academic_calendar for select to authenticated using (true);

drop policy if exists "registrar_manage_calendar" on public.academic_calendar;
create policy "registrar_manage_calendar" on public.academic_calendar for all to authenticated
using (exists (select 1 from public.users where auth_user_id = auth.uid() and role in ('registrar','admin')));

drop policy if exists "student_read_own_standing" on public.academic_standing;
create policy "student_read_own_standing" on public.academic_standing for select to authenticated
using (student_id = (select id from public.users where auth_user_id = auth.uid()));

drop policy if exists "registrar_manage_standing" on public.academic_standing;
create policy "registrar_manage_standing" on public.academic_standing for all to authenticated
using (exists (select 1 from public.users where auth_user_id = auth.uid() and role in ('registrar','admin')));

drop policy if exists "instructor_manage_grade_log" on public.grade_change_log;
create policy "instructor_manage_grade_log" on public.grade_change_log for all to authenticated
using (changed_by = (select id from public.users where auth_user_id = auth.uid()));

drop policy if exists "student_manage_regrade" on public.regrade_requests;
create policy "student_manage_regrade" on public.regrade_requests for all to authenticated
using (student_id = (select id from public.users where auth_user_id = auth.uid()));

drop policy if exists "instructor_read_regrade" on public.regrade_requests;
create policy "instructor_read_regrade" on public.regrade_requests for select to authenticated
using (exists (select 1 from public.users where auth_user_id = auth.uid() and role = 'instructor'));

drop policy if exists "instructor_manage_outlines" on public.course_outlines;
create policy "instructor_manage_outlines" on public.course_outlines for all to authenticated
using (created_by = (select id from public.users where auth_user_id = auth.uid()));

drop policy if exists "students_read_published_outlines" on public.course_outlines;
create policy "students_read_published_outlines" on public.course_outlines for select to authenticated
using (is_published = true and offering_id in (
    select offering_id from public.enrollments
    where student_id = (select id from public.users where auth_user_id = auth.uid())
    and status = 'active'
));

drop policy if exists "read_own_password_log" on public.password_change_log;
create policy "read_own_password_log" on public.password_change_log for select to authenticated
using (user_id = (select id from public.users where auth_user_id = auth.uid()));

drop policy if exists "insert_own_password_log" on public.password_change_log;
create policy "insert_own_password_log" on public.password_change_log for insert to authenticated
with check (user_id = (select id from public.users where auth_user_id = auth.uid()));

-- A13. Prerequisite check function
create or replace function public.check_student_prerequisites(p_student_id uuid, p_offering_id uuid)
returns jsonb language plpgsql security definer as $$
declare
    v_course_id uuid;
    v_result jsonb;
begin
    select course_id into v_course_id from public.course_offerings where id = p_offering_id;
    select jsonb_agg(jsonb_build_object(
        'prerequisite_id', cp.prerequisite_id,
        'course_code', c.code,
        'course_title', c.title,
        'required_grade', cp.min_grade,
        'prereq_type', cp.prerequisite_type,
        'is_met', case when exists (
            select 1 from public.enrollments e
            join public.course_offerings co on co.id = e.offering_id
            where e.student_id = p_student_id and co.course_id = cp.prerequisite_id and e.status = 'completed'
        ) then true else false end
    )) into v_result
    from public.course_prerequisites cp
    join public.courses c on c.id = cp.prerequisite_id
    where cp.course_id = v_course_id;
    return coalesce(v_result, '[]'::jsonb);
end;
$$;
