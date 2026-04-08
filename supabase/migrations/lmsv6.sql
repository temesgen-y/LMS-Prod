-- =============================================================================
--  university lms — complete database schema
--  supabase / postgresql compatible
--  version: 6.0 — production ready
--
--  changes from v5:
--    - dropped  : student_registrations
--    - fixed    : lessons.type = content only (video|document|link|scorm)
--    - fixed    : attachments = fully generic (no entity_type/entity_id)
--    - fixed    : lesson_materials = link table (lesson_id → attachment_id)
--    - fixed    : gradebook_items supports assessment_id + assignment_id (two fks)
--    - fixed    : grades supports assessment_id + assignment_id (two fks)
--    - added    : audit_logs table
--    - added    : set_updated_at() trigger function on all updated_at tables
--    - added    : enrolled_count auto-maintenance trigger
--    - added    : uq_one_current_term partial unique index
--    - added    : uq_users_email_lower case-insensitive email index
--
--  tables (35):
--   01 users                    02 admin_profiles
--   03 instructor_profiles      04 student_profiles
--   05 institution_settings     06 departments
--   07 academic_programs        08 academic_terms
--   09 courses                  10 course_offerings
--   11 course_instructors       12 course_modules
--   13 lessons                  14 attachments
--   15 lesson_materials         16 live_sessions
--   17 course_module_items      18 enrollments
--   19 lesson_progress          20 attendance
--   21 assessments              22 questions
--   23 question_options         24 assessment_attempts
--   25 student_answers          26 assignments
--   27 assignment_submissions   28 grades
--   29 gradebook_items          30 live_session_attendance
--   31 announcements            32 forum_threads
--   33 forum_posts              34 notifications
--   35 certificates             36 audit_logs
-- =============================================================================

create extension if not exists "uuid-ossp";


-- =============================================================================
--  shared trigger function — auto-updates updated_at on every table that has it
-- =============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;


-- =============================================================================
--  module 1 — auth & user management
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 01. users
-- single sign-in page for all roles.
-- role drives post-login redirect:
--   admin       → admin dashboard
--   instructor  → instructor dashboard
--   student     → student dashboard
-- created_by is self-referencing (fk added after table creation).
-- email uniqueness is enforced case-insensitively via lower(email) index.
-- -----------------------------------------------------------------------------
create table if not exists public.users (
    id              uuid        not null default uuid_generate_v4(),
    auth_user_id    uuid,                           -- supabase auth / oauth uid
    email           text        not null,
    first_name      text        not null,
    last_name       text        not null,
    role            text        not null default 'student',
    status          text        not null default 'active',
    avatar_url      text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    created_by      uuid,                           -- fk → users.id (self-ref, added below)

    constraint pk_users
        primary key (id),
    constraint uq_users_auth_user_id
        unique (auth_user_id),
    constraint chk_users_role
        check (role in ('admin','instructor','student')),
    constraint chk_users_status
        check (status in ('active','inactive','suspended','pending'))
);

-- self-referencing fk — must be added after table creation
do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'fk_users_created_by'
    ) then
        alter table public.users
            add constraint fk_users_created_by
                foreign key (created_by)
                references public.users(id)
                on delete set null;
    end if;
end;
$$;

-- case-insensitive email uniqueness (replaces plain uq_users_email)
create unique index if not exists uq_users_email_lower
    on public.users (lower(email));

create index if not exists idx_users_role       on public.users(role);
create index if not exists idx_users_status     on public.users(status);
create index if not exists idx_users_created_by on public.users(created_by);

create or replace trigger trg_users_updated_at
    before update on public.users
    for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 02. admin_profiles
-- 1-to-1 extended profile for role = admin.
-- -----------------------------------------------------------------------------
create table if not exists public.admin_profiles (
    id              uuid        not null default uuid_generate_v4(),
    user_id         uuid        not null,           -- fk → users.id
    profile_status  text        not null default 'active',
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    created_by      uuid,                           -- fk → users.id (admin)

    constraint pk_admin_profiles
        primary key (id),
    constraint uq_admin_profiles_user_id
        unique (user_id),
    constraint fk_admin_profiles_user
        foreign key (user_id)
        references public.users(id)
        on delete cascade,
    constraint fk_admin_profiles_created_by
        foreign key (created_by)
        references public.users(id)
        on delete set null,
    constraint chk_admin_profiles_status
        check (profile_status in ('active','inactive'))
);

create index if not exists idx_admin_profiles_user_id
    on public.admin_profiles(user_id);

create or replace trigger trg_admin_profiles_updated_at
    before update on public.admin_profiles
    for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 03. instructor_profiles
-- 1-to-1 extended profile for role = instructor.
-- rule: only admin can create instructors — never self-registered.
-- created_by is required and must reference an admin user.
-- -----------------------------------------------------------------------------
create table if not exists public.instructor_profiles (
    id                uuid        not null default uuid_generate_v4(),
    user_id           uuid        not null,         -- fk → users.id
    instructor_no     text,                         -- e.g. 'ins-2025-001' (admin assigned)
    department        text        not null,
    title             text,                         -- dr. | prof. | mr. | ms.
    specialization    text,
    qualification     text,                         -- phd | msc | bsc
    bio               text,
    office_hours      text,
    hire_date         date,
    employment_status text        not null default 'full_time',
    profile_status    text        not null default 'active',
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),
    created_by        uuid        not null,         -- fk → users.id (must be admin)

    constraint pk_instructor_profiles
        primary key (id),
    constraint uq_instructor_profiles_user_id
        unique (user_id),
    constraint uq_instructor_no
        unique (instructor_no),
    constraint fk_instructor_profiles_user
        foreign key (user_id)
        references public.users(id)
        on delete cascade,
    constraint fk_instructor_profiles_created_by
        foreign key (created_by)
        references public.users(id)
        on delete restrict,
    constraint chk_instructor_employment
        check (employment_status in ('full_time','part_time','contract')),
    constraint chk_instructor_profile_status
        check (profile_status in ('active','inactive'))
);

create index if not exists idx_instructor_profiles_user_id
    on public.instructor_profiles(user_id);

create or replace trigger trg_instructor_profiles_updated_at
    before update on public.instructor_profiles
    for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 04. student_profiles
-- 1-to-1 extended profile for role = student.
-- student_no is auto-generated by app logic on account creation.
-- -----------------------------------------------------------------------------
create table if not exists public.student_profiles (
    id              uuid        not null default uuid_generate_v4(),
    user_id         uuid        not null,           -- fk → users.id
    student_no      text,                           -- e.g. 'stu-2025-0042'
    program         text        not null,
    degree_level    text        not null,
    profile_status  text        not null default 'active',
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    created_by      uuid,                           -- fk → users.id (admin)

    constraint pk_student_profiles
        primary key (id),
    constraint uq_student_profiles_user_id
        unique (user_id),
    constraint uq_student_no
        unique (student_no),
    constraint fk_student_profiles_user
        foreign key (user_id)
        references public.users(id)
        on delete cascade,
    constraint fk_student_profiles_created_by
        foreign key (created_by)
        references public.users(id)
        on delete set null,
    constraint chk_student_degree_level
        check (degree_level in ('certificate','diploma','bachelor','master','phd')),
    constraint chk_student_profile_status
        check (profile_status in ('active','inactive','graduated','suspended'))
);

create index if not exists idx_student_profiles_user_id    on public.student_profiles(user_id);
create index if not exists idx_student_profiles_student_no on public.student_profiles(student_no);

create or replace trigger trg_student_profiles_updated_at
    before update on public.student_profiles
    for each row execute function public.set_updated_at();


-- =============================================================================
--  module 2 — institution settings
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 05. institution_settings
-- single-row configuration table for the whole institution.
-- grading_scale, features, and term_defaults stored as jsonb.
-- enforce single row in application layer or with a before-insert trigger.
-- -----------------------------------------------------------------------------
create table if not exists public.institution_settings (
    id                  uuid        not null default uuid_generate_v4(),
    institution_name    text        not null default 'my university',
    logo_url            text,
    address             text,
    phone               text,
    email               text,
    website             text,
    -- {"A":{"min":90,"max":100},"B":{"min":80,"max":89},...}
    grading_scale       jsonb       not null default '{
        "A": {"min": 90, "max": 100},
        "B": {"min": 80, "max": 89},
        "C": {"min": 70, "max": 79},
        "D": {"min": 60, "max": 69},
        "F": {"min":  0, "max": 59}
    }'::jsonb,
    -- {"forums":true,"certificates":true,"live_sessions":true,...}
    features            jsonb       not null default '{
        "forums": true,
        "certificates": true,
        "live_sessions": true,
        "announcements": true,
        "attendance": true
    }'::jsonb,
    -- {"terms_per_year":2,"default_term_type":"semester"}
    term_defaults       jsonb       not null default '{
        "terms_per_year": 2,
        "default_term_type": "semester"
    }'::jsonb,
    updated_at          timestamptz not null default now(),
    updated_by          uuid,                       -- fk → users.id (admin)

    constraint pk_institution_settings
        primary key (id),
    constraint fk_institution_settings_updated_by
        foreign key (updated_by)
        references public.users(id)
        on delete set null
);

create or replace trigger trg_institution_settings_updated_at
    before update on public.institution_settings
    for each row execute function public.set_updated_at();


-- =============================================================================
--  module 3 — academic structure
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 06. departments
-- university faculties / departments.
-- head_id → users.id (must be a user with role = instructor).
-- -----------------------------------------------------------------------------
create table if not exists public.departments (
    id          uuid        not null default uuid_generate_v4(),
    name        text        not null,
    code        text        not null,               -- e.g. 'cs', 'eng', 'bus'
    head_id     uuid,                               -- fk → users.id (instructor)
    description text,
    is_active   boolean     not null default true,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),

    constraint pk_departments
        primary key (id),
    constraint uq_departments_name
        unique (name),
    constraint uq_departments_code
        unique (code),
    constraint fk_departments_head_id
        foreign key (head_id)
        references public.users(id)
        on delete set null
);

create index if not exists idx_departments_code      on public.departments(code);
create index if not exists idx_departments_is_active on public.departments(is_active);

create or replace trigger trg_departments_updated_at
    before update on public.departments
    for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 07. academic_programs
-- degree programs offered by a department.
-- e.g. bsc computer science, msc data science
-- -----------------------------------------------------------------------------
create table if not exists public.academic_programs (
    id              uuid        not null default uuid_generate_v4(),
    department_id   uuid        not null,           -- fk → departments.id
    name            text        not null,
    code            text        not null,           -- e.g. 'bscs'
    degree_level    text        not null,
    duration_years  smallint    not null default 4,
    is_active       boolean     not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    constraint pk_academic_programs
        primary key (id),
    constraint uq_academic_programs_code
        unique (code),
    constraint fk_academic_programs_department
        foreign key (department_id)
        references public.departments(id)
        on delete restrict,
    constraint chk_academic_programs_degree
        check (degree_level in ('certificate','diploma','bachelor','master','phd')),
    constraint chk_academic_programs_duration
        check (duration_years between 1 and 8)
);

create index if not exists idx_academic_programs_department on public.academic_programs(department_id);
create index if not exists idx_academic_programs_degree     on public.academic_programs(degree_level);

create or replace trigger trg_academic_programs_updated_at
    before update on public.academic_programs
    for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 08. academic_terms
-- one row per term (sem1, sem2, summer) within an academic year.
-- partial unique index enforces only one is_current = true at a time.
-- -----------------------------------------------------------------------------
create table if not exists public.academic_terms (
    id                   uuid        not null default uuid_generate_v4(),
    academic_year_label  text        not null,      -- e.g. '2025-2026'
    year_start           smallint    not null,      -- e.g. 2025
    year_end             smallint    not null,      -- e.g. 2026
    term_name            text        not null,      -- e.g. 'semester 1'
    term_code            text        not null,      -- 'SEM1' | 'SEM2' | 'SUMMER'
    term_number          smallint,                  -- 1 or 2 (null for summer)
    start_date           date        not null,
    end_date             date        not null,
    is_current           boolean     not null default false,
    status               text        not null default 'upcoming'
        check (status in ('upcoming','active','closed')),
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now(),

    constraint pk_academic_terms
        primary key (id),
    constraint uq_academic_terms_year_term
        unique (academic_year_label, term_code),
    constraint chk_academic_terms_dates
        check (end_date > start_date),
    constraint chk_academic_terms_years
        check (year_end = year_start + 1),
    constraint chk_academic_terms_term_code
        check (term_code in ('SEM1','SEM2','SUMMER')),
    constraint chk_academic_terms_term_number
        check (
            (term_code in ('SEM1','SEM2') and term_number in (1, 2))
            or
            (term_code = 'SUMMER' and term_number is null)
        )
);

-- enforce only one current term at a time across the entire table
create unique index if not exists uq_one_current_term
    on public.academic_terms ((true))
    where is_current = true;

create index if not exists idx_academic_terms_current    on public.academic_terms(is_current);
create index if not exists idx_academic_terms_status     on public.academic_terms(status);
create index if not exists idx_academic_terms_year       on public.academic_terms(year_start, year_end);
create index if not exists idx_academic_terms_year_label on public.academic_terms(academic_year_label);

create or replace trigger trg_academic_terms_updated_at
    before update on public.academic_terms
    for each row execute function public.set_updated_at();


-- =============================================================================
--  module 4 — courses & content
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 09. courses
-- master subject catalogue. defines what is taught.
-- one row per subject — runs many times via course_offerings.
-- -----------------------------------------------------------------------------
create table if not exists public.courses (
    id              uuid        not null default uuid_generate_v4(),
    department_id   uuid        not null,           -- fk → departments.id
    code            text        not null,           -- e.g. 'cs301'
    title           text        not null,
    description     text,
    credit_hours    smallint    not null default 3,
    level           text        not null default '100',
    is_active       boolean     not null default true,
    created_by      uuid        not null,           -- fk → users.id (admin)
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    constraint pk_courses
        primary key (id),
    constraint uq_courses_code
        unique (code),
    constraint fk_courses_department
        foreign key (department_id)
        references public.departments(id)
        on delete restrict,
    constraint fk_courses_created_by
        foreign key (created_by)
        references public.users(id)
        on delete restrict,
    constraint chk_courses_level
        check (level in ('100','200','300','400','postgraduate')),
    constraint chk_courses_credit_hours
        check (credit_hours between 1 and 6)
);

create index if not exists idx_courses_department on public.courses(department_id);
create index if not exists idx_courses_is_active  on public.courses(is_active);

create or replace trigger trg_courses_updated_at
    before update on public.courses
    for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 10. course_offerings
-- a specific running of a course in a given term.
-- students enrol here — not in courses directly.
-- enrolled_count is auto-maintained by trigger (see bottom of file).
-- -----------------------------------------------------------------------------
create table if not exists public.course_offerings (
    id              uuid        not null default uuid_generate_v4(),
    course_id       uuid        not null,           -- fk → courses.id
    term_id         uuid        not null,           -- fk → academic_terms.id
    section_name    text        not null default 'A',
    max_students    smallint    not null default 50,
    enrolled_count  smallint    not null default 0, -- auto-maintained by trigger
    schedule        text,                           -- e.g. 'mon/wed 10:00–11:30 am'
    room            text,
    status          text        not null default 'upcoming'
        check (status in ('upcoming','active','completed','cancelled')),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    constraint pk_course_offerings
        primary key (id),
    constraint uq_course_offerings
        unique (course_id, term_id, section_name),
    constraint fk_course_offerings_course
        foreign key (course_id)
        references public.courses(id)
        on delete restrict,
    constraint fk_course_offerings_term
        foreign key (term_id)
        references public.academic_terms(id)
        on delete restrict,
    constraint chk_course_offerings_max
        check (max_students > 0),
    constraint chk_course_offerings_enrolled
        check (enrolled_count >= 0 and enrolled_count <= max_students)
);

create index if not exists idx_course_offerings_course  on public.course_offerings(course_id);
create index if not exists idx_course_offerings_term    on public.course_offerings(term_id);
create index if not exists idx_course_offerings_status  on public.course_offerings(status);

create or replace trigger trg_course_offerings_updated_at
    before update on public.course_offerings
    for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 11. course_instructors
-- who teaches a course offering.
-- partial unique index enforces only ONE primary instructor per offering.
-- co_instructor and assistant roles can have multiple rows.
-- -----------------------------------------------------------------------------
create table if not exists public.course_instructors (
    id              uuid        not null default uuid_generate_v4(),
    offering_id     uuid        not null,           -- fk → course_offerings.id
    instructor_id   uuid        not null,           -- fk → users.id
    role            text        not null default 'primary',
    assigned_at     timestamptz not null default now(),
    assigned_by     uuid,                           -- fk → users.id (admin)

    constraint pk_course_instructors
        primary key (id),
    constraint uq_course_instructors
        unique (offering_id, instructor_id),
    constraint fk_course_instructors_offering
        foreign key (offering_id)
        references public.course_offerings(id)
        on delete cascade,
    constraint fk_course_instructors_instructor
        foreign key (instructor_id)
        references public.users(id)
        on delete restrict,
    constraint fk_course_instructors_assigned_by
        foreign key (assigned_by)
        references public.users(id)
        on delete set null,
    constraint chk_course_instructors_role
        check (role in ('primary','co_instructor','assistant'))
);

-- only one primary instructor allowed per offering
create unique index if not exists uix_one_primary_per_offering
    on public.course_instructors(offering_id)
    where role = 'primary';

create index if not exists idx_course_instructors_offering   on public.course_instructors(offering_id);
create index if not exists idx_course_instructors_instructor on public.course_instructors(instructor_id);
create index if not exists idx_course_instructors_role       on public.course_instructors(role);


-- -----------------------------------------------------------------------------
-- 12. course_modules
-- how content is organised inside a course offering.
-- divides course into modules / weeks / units / topics.
-- students see items grouped under modules — not as a flat list.
-- -----------------------------------------------------------------------------
create table if not exists public.course_modules (
    id              uuid        not null default uuid_generate_v4(),
    offering_id     uuid        not null,           -- fk → course_offerings.id
    title           text        not null,           -- e.g. 'module 1: intro to databases'
    description     text,
    sort_order      smallint    not null default 0,
    is_visible      boolean     not null default true,
    unlock_date     date,                           -- drip release — visible from this date
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    constraint pk_course_modules
        primary key (id),
    constraint fk_course_modules_offering
        foreign key (offering_id)
        references public.course_offerings(id)
        on delete cascade,
    constraint chk_course_modules_sort
        check (sort_order >= 0)
);

create index if not exists idx_course_modules_offering on public.course_modules(offering_id);
create index if not exists idx_course_modules_sort     on public.course_modules(offering_id, sort_order);
create index if not exists idx_course_modules_visible  on public.course_modules(offering_id, is_visible);

create or replace trigger trg_course_modules_updated_at
    before update on public.course_modules
    for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 13. lessons
-- content-only learning units: video | document | link | scorm.
-- quiz / assignment / live_session are NOT lesson types —
-- they are referenced directly in course_module_items.
-- placed inside modules via course_module_items (item_type = 'lesson').
-- -----------------------------------------------------------------------------
create table if not exists public.lessons (
    id              uuid        not null default uuid_generate_v4(),
    offering_id     uuid        not null,           -- fk → course_offerings.id (denormalised)
    title           text        not null,
    type            text        not null,           -- video | document | link | scorm ONLY
    content_url     text,                           -- url for video / pdf / scorm / external link
    content_body    text,                           -- inline html typed in editor
    duration_mins   smallint,
    is_visible      boolean     not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    constraint pk_lessons
        primary key (id),
    constraint fk_lessons_offering
        foreign key (offering_id)
        references public.course_offerings(id)
        on delete cascade,
    constraint chk_lessons_type
        check (type in ('video','document','link','scorm')),
    constraint chk_lessons_duration
        check (duration_mins is null or duration_mins > 0)
);

create index if not exists idx_lessons_offering on public.lessons(offering_id);
create index if not exists idx_lessons_type     on public.lessons(type);

create or replace trigger trg_lessons_updated_at
    before update on public.lessons
    for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 14. attachments
-- fully generic file storage table — no entity_type / entity_id columns.
-- stores file metadata only. relationships to parents are handled by
-- dedicated link tables (lesson_materials, etc.).
-- -----------------------------------------------------------------------------
create table if not exists public.attachments (
    id           uuid        not null default uuid_generate_v4(),
    file_name    text        not null,              -- original file name
    file_url     text        not null,              -- supabase storage / s3 url
    mime_type    text        not null,              -- e.g. 'application/pdf', 'image/png'
    size_kb      integer,
    uploaded_by  uuid        not null,              -- fk → users.id
    created_at   timestamptz not null default now(),

    constraint pk_attachments
        primary key (id),
    constraint fk_attachments_uploaded_by
        foreign key (uploaded_by)
        references public.users(id)
        on delete restrict,
    constraint chk_attachments_size
        check (size_kb is null or size_kb > 0)
);

create index if not exists idx_attachments_uploaded_by on public.attachments(uploaded_by);


-- -----------------------------------------------------------------------------
-- 15. lesson_materials
-- link table: connects lessons to their downloadable attachments.
-- one row per attachment per lesson.
-- sort_order controls display order of materials within a lesson.
-- -----------------------------------------------------------------------------
create table if not exists public.lesson_materials (
    id            uuid        not null default uuid_generate_v4(),
    lesson_id     uuid        not null,             -- fk → lessons.id
    attachment_id uuid        not null,             -- fk → attachments.id
    sort_order    smallint    not null default 0,
    created_at    timestamptz not null default now(),

    constraint pk_lesson_materials
        primary key (id),
    constraint uq_lesson_materials
        unique (lesson_id, attachment_id),          -- same file cannot be linked twice
    constraint fk_lesson_materials_lesson
        foreign key (lesson_id)
        references public.lessons(id)
        on delete cascade,
    constraint fk_lesson_materials_attachment
        foreign key (attachment_id)
        references public.attachments(id)
        on delete cascade
);

create index if not exists idx_lesson_materials_lesson     on public.lesson_materials(lesson_id);
create index if not exists idx_lesson_materials_attachment on public.lesson_materials(attachment_id);


-- -----------------------------------------------------------------------------
-- 16. live_sessions
-- scheduled virtual class sessions (zoom, google meet, teams).
-- placed inside modules via course_module_items (item_type = 'live_session').
-- recording_url added after session ends.
-- -----------------------------------------------------------------------------
create table if not exists public.live_sessions (
    id              uuid        not null default uuid_generate_v4(),
    offering_id     uuid        not null,           -- fk → course_offerings.id
    instructor_id   uuid        not null,           -- fk → users.id
    title           text        not null,
    platform        text        not null,
    join_url        text        not null,
    meeting_id      text,
    passcode        text,
    scheduled_at    timestamptz not null,
    duration_mins   smallint    not null default 60,
    recording_url   text,
    status          text        not null default 'scheduled'
        check (status in ('scheduled','live','completed','cancelled')),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    constraint pk_live_sessions
        primary key (id),
    constraint fk_live_sessions_offering
        foreign key (offering_id)
        references public.course_offerings(id)
        on delete cascade,
    constraint fk_live_sessions_instructor
        foreign key (instructor_id)
        references public.users(id)
        on delete restrict,
    constraint chk_live_sessions_platform
        check (platform in ('zoom','google_meet','teams','other')),
    constraint chk_live_sessions_duration
        check (duration_mins > 0)
);

create index if not exists idx_live_sessions_offering  on public.live_sessions(offering_id);
create index if not exists idx_live_sessions_status    on public.live_sessions(status);
create index if not exists idx_live_sessions_scheduled on public.live_sessions(scheduled_at);

create or replace trigger trg_live_sessions_updated_at
    before update on public.live_sessions
    for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 17. course_module_items
-- the ordered list of items inside a module.
-- answers: "what appears inside this module, and in what order?"
--
-- item types and which fk column is set:
--   'lesson'       → lesson_id is set
--   'assessment'   → assessment_id is set  (fk added after assessments table)
--   'assignment'   → assignment_id is set  (fk added after assignments table)
--   'live_session' → live_session_id is set
--   'link'         → item_url is set, all fk columns are null
--
-- check constraint enforces only one fk column is populated per row.
-- integrity between item_type and referenced table is enforced in app code.
-- is_mandatory = true means student must complete this item before next unlocks.
-- -----------------------------------------------------------------------------
create table if not exists public.course_module_items (
    id               uuid        not null default uuid_generate_v4(),
    module_id        uuid        not null,          -- fk → course_modules.id
    offering_id      uuid        not null,          -- fk → course_offerings.id (denormalised)
    item_type        text        not null,
    sort_order       smallint    not null default 0,
    is_visible       boolean     not null default true,
    is_mandatory     boolean     not null default false,
    lesson_id        uuid,                          -- fk → lessons.id
    assessment_id    uuid,                          -- fk → assessments.id (added after)
    assignment_id    uuid,                          -- fk → assignments.id (added after)
    live_session_id  uuid,                          -- fk → live_sessions.id
    item_url         text,                          -- set when item_type = 'link'
    item_title       text,                          -- optional display title override
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),

    constraint pk_course_module_items
        primary key (id),
    constraint fk_cmi_module
        foreign key (module_id)
        references public.course_modules(id)
        on delete cascade,
    constraint fk_cmi_offering
        foreign key (offering_id)
        references public.course_offerings(id)
        on delete cascade,
    constraint fk_cmi_lesson
        foreign key (lesson_id)
        references public.lessons(id)
        on delete cascade,
    constraint fk_cmi_live_session
        foreign key (live_session_id)
        references public.live_sessions(id)
        on delete cascade,
    constraint chk_cmi_item_type
        check (item_type in ('lesson','assessment','assignment','live_session','link')),
    constraint chk_cmi_sort
        check (sort_order >= 0),
    constraint chk_cmi_fk_consistency
        check (
            (item_type = 'lesson'
                and lesson_id is not null
                and assessment_id is null and assignment_id is null
                and live_session_id is null and item_url is null)
            or
            (item_type = 'assessment'
                and assessment_id is not null
                and lesson_id is null and assignment_id is null
                and live_session_id is null and item_url is null)
            or
            (item_type = 'assignment'
                and assignment_id is not null
                and lesson_id is null and assessment_id is null
                and live_session_id is null and item_url is null)
            or
            (item_type = 'live_session'
                and live_session_id is not null
                and lesson_id is null and assessment_id is null
                and assignment_id is null and item_url is null)
            or
            (item_type = 'link'
                and item_url is not null
                and lesson_id is null and assessment_id is null
                and assignment_id is null and live_session_id is null)
        )
);

create index if not exists idx_cmi_module     on public.course_module_items(module_id);
create index if not exists idx_cmi_offering   on public.course_module_items(offering_id);
create index if not exists idx_cmi_sort       on public.course_module_items(module_id, sort_order);
create index if not exists idx_cmi_item_type  on public.course_module_items(item_type);
create index if not exists idx_cmi_lesson     on public.course_module_items(lesson_id);
create index if not exists idx_cmi_assessment on public.course_module_items(assessment_id);
create index if not exists idx_cmi_assignment on public.course_module_items(assignment_id);

create or replace trigger trg_cmi_updated_at
    before update on public.course_module_items
    for each row execute function public.set_updated_at();


-- =============================================================================
--  module 5 — enrollments & progress
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 18. enrollments
-- student's official enrollment in a course offering.
-- one row per student per offering (unique constraint enforces this).
-- enrolled_count on course_offerings is maintained by trigger (see bottom).
-- -----------------------------------------------------------------------------
create table if not exists public.enrollments (
    id              uuid            not null default uuid_generate_v4(),
    student_id      uuid            not null,       -- fk → users.id
    offering_id     uuid            not null,       -- fk → course_offerings.id
    enrolled_by     uuid,                           -- fk → users.id (admin); null = self
    status          text            not null default 'active',
    final_grade     text,                           -- set at semester end
    final_score     decimal(5,2),                   -- sum of gradebook_items.weighted_score
    enrolled_at     timestamptz     not null default now(),
    completed_at    timestamptz,
    dropped_at      timestamptz,
    updated_at      timestamptz     not null default now(),

    constraint pk_enrollments
        primary key (id),
    constraint uq_enrollments
        unique (student_id, offering_id),
    constraint fk_enrollments_student
        foreign key (student_id)
        references public.users(id)
        on delete restrict,
    constraint fk_enrollments_offering
        foreign key (offering_id)
        references public.course_offerings(id)
        on delete restrict,
    constraint fk_enrollments_enrolled_by
        foreign key (enrolled_by)
        references public.users(id)
        on delete set null,
    constraint chk_enrollments_status
        check (status in ('active','completed','dropped','failed')),
    constraint chk_enrollments_final_grade
        check (final_grade is null or final_grade in ('A','B','C','D','F','I')),
    constraint chk_enrollments_final_score
        check (final_score is null or final_score between 0 and 100)
);

create index if not exists idx_enrollments_student  on public.enrollments(student_id);
create index if not exists idx_enrollments_offering on public.enrollments(offering_id);
create index if not exists idx_enrollments_status   on public.enrollments(status);

create or replace trigger trg_enrollments_updated_at
    before update on public.enrollments
    for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 19. lesson_progress
-- tracks each student's completion per lesson.
-- one row per student per lesson — created on first access.
-- -----------------------------------------------------------------------------
create table if not exists public.lesson_progress (
    id              uuid        not null default uuid_generate_v4(),
    enrollment_id   uuid        not null,           -- fk → enrollments.id
    lesson_id       uuid        not null,           -- fk → lessons.id
    student_id      uuid        not null,           -- fk → users.id (denormalised)
    status          text        not null default 'not_started',
    time_spent_s    integer     not null default 0,
    started_at      timestamptz,
    completed_at    timestamptz,
    updated_at      timestamptz not null default now(),

    constraint pk_lesson_progress
        primary key (id),
    constraint uq_lesson_progress
        unique (enrollment_id, lesson_id),
    constraint fk_lesson_progress_enrollment
        foreign key (enrollment_id)
        references public.enrollments(id)
        on delete cascade,
    constraint fk_lesson_progress_lesson
        foreign key (lesson_id)
        references public.lessons(id)
        on delete cascade,
    constraint fk_lesson_progress_student
        foreign key (student_id)
        references public.users(id)
        on delete cascade,
    constraint chk_lesson_progress_status
        check (status in ('not_started','in_progress','completed')),
    constraint chk_lesson_progress_time
        check (time_spent_s >= 0)
);

create index if not exists idx_lesson_progress_enrollment on public.lesson_progress(enrollment_id);
create index if not exists idx_lesson_progress_lesson     on public.lesson_progress(lesson_id);
create index if not exists idx_lesson_progress_student    on public.lesson_progress(student_id);

create or replace trigger trg_lesson_progress_updated_at
    before update on public.lesson_progress
    for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 20. attendance
-- tracks student attendance for both:
--   type = 'live_session' → live_session_id set, lesson_id null
--   type = 'lesson'       → lesson_id set, live_session_id null
-- check constraint enforces this at database level.
-- -----------------------------------------------------------------------------
create table if not exists public.attendance (
    id               uuid        not null default uuid_generate_v4(),
    enrollment_id    uuid        not null,          -- fk → enrollments.id
    student_id       uuid        not null,          -- fk → users.id (denormalised)
    offering_id      uuid        not null,          -- fk → course_offerings.id (denormalised)
    live_session_id  uuid,                          -- fk → live_sessions.id
    lesson_id        uuid,                          -- fk → lessons.id
    type             text        not null,
    status           text        not null default 'absent',
    attendance_date  date        not null default current_date,
    joined_at        timestamptz,
    left_at          timestamptz,
    duration_mins    smallint,
    marked_by        uuid,                          -- fk → users.id (instructor)
    marked_at        timestamptz,
    note             text,

    constraint pk_attendance
        primary key (id),
    constraint uq_attendance_live
        unique (live_session_id, student_id),
    constraint uq_attendance_lesson
        unique (lesson_id, student_id, attendance_date),
    constraint fk_attendance_enrollment
        foreign key (enrollment_id)
        references public.enrollments(id)
        on delete cascade,
    constraint fk_attendance_student
        foreign key (student_id)
        references public.users(id)
        on delete cascade,
    constraint fk_attendance_offering
        foreign key (offering_id)
        references public.course_offerings(id)
        on delete cascade,
    constraint fk_attendance_live_session
        foreign key (live_session_id)
        references public.live_sessions(id)
        on delete cascade,
    constraint fk_attendance_lesson
        foreign key (lesson_id)
        references public.lessons(id)
        on delete cascade,
    constraint fk_attendance_marked_by
        foreign key (marked_by)
        references public.users(id)
        on delete set null,
    constraint chk_attendance_type
        check (type in ('live_session','lesson')),
    constraint chk_attendance_status
        check (status in ('present','absent','late','excused')),
    constraint chk_attendance_type_fk
        check (
            (type = 'live_session' and live_session_id is not null and lesson_id is null)
            or
            (type = 'lesson'       and lesson_id is not null and live_session_id is null)
        )
);

create index if not exists idx_attendance_enrollment   on public.attendance(enrollment_id);
create index if not exists idx_attendance_student      on public.attendance(student_id);
create index if not exists idx_attendance_offering     on public.attendance(offering_id);
create index if not exists idx_attendance_live_session on public.attendance(live_session_id);
create index if not exists idx_attendance_lesson       on public.attendance(lesson_id);
create index if not exists idx_attendance_date         on public.attendance(attendance_date);
create index if not exists idx_attendance_type         on public.attendance(type);


-- =============================================================================
--  module 6 — assessments & grades
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 21. assessments
-- quiz, midterm, or final exam definition.
-- placed in modules via course_module_items (item_type = 'assessment').
-- -----------------------------------------------------------------------------
create table if not exists public.assessments (
    id                uuid            not null default uuid_generate_v4(),
    offering_id       uuid            not null,    -- fk → course_offerings.id
    created_by        uuid            not null,    -- fk → users.id (instructor)
    title             text            not null,
    type              text            not null,
    instructions      text,
    total_marks       smallint        not null default 100,
    pass_mark         smallint        not null default 50,
    time_limit_mins   smallint,
    max_attempts      smallint        not null default 1,
    shuffle_questions boolean         not null default false,
    shuffle_options   boolean         not null default false,
    show_result       boolean         not null default true,
    show_answers      boolean         not null default false,
    available_from    timestamptz,
    available_until   timestamptz,
    weight_pct        decimal(5,2)    not null default 0,
    status            text            not null default 'draft'
        check (status in ('draft','published','closed','archived')),
    created_at        timestamptz     not null default now(),
    updated_at        timestamptz     not null default now(),

    constraint pk_assessments
        primary key (id),
    constraint fk_assessments_offering
        foreign key (offering_id)
        references public.course_offerings(id)
        on delete cascade,
    constraint fk_assessments_created_by
        foreign key (created_by)
        references public.users(id)
        on delete restrict,
    constraint chk_assessments_type
        check (type in ('quiz','midterm','final_exam','practice')),
    constraint chk_assessments_pass_lte_total
        check (pass_mark <= total_marks),
    constraint chk_assessments_weight
        check (weight_pct between 0 and 100),
    constraint chk_assessments_dates
        check (available_until is null or available_until > available_from),
    constraint chk_assessments_attempts
        check (max_attempts >= 1)
);

-- add deferred fk: course_module_items → assessments (table now exists)
do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'fk_cmi_assessment'
    ) then
        alter table public.course_module_items
            add constraint fk_cmi_assessment
                foreign key (assessment_id)
                references public.assessments(id)
                on delete cascade;
    end if;
end;
$$;

create index if not exists idx_assessments_offering on public.assessments(offering_id);
create index if not exists idx_assessments_status   on public.assessments(status);
create index if not exists idx_assessments_type     on public.assessments(type);

create or replace trigger trg_assessments_updated_at
    before update on public.assessments
    for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 22. questions
-- individual questions inside an assessment.
-- -----------------------------------------------------------------------------
create table if not exists public.questions (
    id              uuid        not null default uuid_generate_v4(),
    assessment_id   uuid        not null,           -- fk → assessments.id
    type            text        not null,
    body            text        not null,           -- html supported
    media_url       text,
    marks           smallint    not null default 1,
    explanation     text,                           -- shown after attempt if show_answers=true
    sort_order      smallint    not null default 0,
    created_at      timestamptz not null default now(),

    constraint pk_questions
        primary key (id),
    constraint fk_questions_assessment
        foreign key (assessment_id)
        references public.assessments(id)
        on delete cascade,
    constraint chk_questions_type
        check (type in ('mcq','true_false','short_answer','fill_blank','essay','matching')),
    constraint chk_questions_marks
        check (marks >= 1)
);

create index if not exists idx_questions_assessment on public.questions(assessment_id);


-- -----------------------------------------------------------------------------
-- 23. question_options
-- answer choices for mcq and true/false questions.
-- -----------------------------------------------------------------------------
create table if not exists public.question_options (
    id          uuid        not null default uuid_generate_v4(),
    question_id uuid        not null,               -- fk → questions.id
    body        text        not null,
    is_correct  boolean     not null default false,
    sort_order  smallint    not null default 0,

    constraint pk_question_options
        primary key (id),
    constraint fk_question_options_question
        foreign key (question_id)
        references public.questions(id)
        on delete cascade
);

create index if not exists idx_question_options_question on public.question_options(question_id);


-- -----------------------------------------------------------------------------
-- 24. assessment_attempts
-- one row per student per attempt.
-- multiple rows allowed if max_attempts > 1 on the assessment.
-- -----------------------------------------------------------------------------
create table if not exists public.assessment_attempts (
    id              uuid            not null default uuid_generate_v4(),
    assessment_id   uuid            not null,       -- fk → assessments.id
    student_id      uuid            not null,       -- fk → users.id
    enrollment_id   uuid            not null,       -- fk → enrollments.id
    attempt_number  smallint        not null default 1,
    status          text            not null default 'in_progress'
        check (status in ('in_progress','submitted','graded','timed_out')),
    score           decimal(5,2),
    score_pct       decimal(5,2),
    passed          boolean,
    ip_address      text,                           -- for academic integrity
    started_at      timestamptz     not null default now(),
    submitted_at    timestamptz,
    time_taken_s    integer,
    graded_at       timestamptz,
    graded_by       uuid,                           -- fk → users.id; null = auto-graded

    constraint pk_assessment_attempts
        primary key (id),
    constraint uq_assessment_attempts
        unique (assessment_id, student_id, attempt_number),
    constraint fk_assessment_attempts_assessment
        foreign key (assessment_id)
        references public.assessments(id)
        on delete cascade,
    constraint fk_assessment_attempts_student
        foreign key (student_id)
        references public.users(id)
        on delete cascade,
    constraint fk_assessment_attempts_enrollment
        foreign key (enrollment_id)
        references public.enrollments(id)
        on delete cascade,
    constraint fk_assessment_attempts_graded_by
        foreign key (graded_by)
        references public.users(id)
        on delete set null,
    constraint chk_assessment_attempts_score_pct
        check (score_pct is null or score_pct between 0 and 100),
    constraint chk_assessment_attempts_number
        check (attempt_number >= 1)
);

create index if not exists idx_assessment_attempts_assessment on public.assessment_attempts(assessment_id);
create index if not exists idx_assessment_attempts_student    on public.assessment_attempts(student_id);
create index if not exists idx_assessment_attempts_enrollment on public.assessment_attempts(enrollment_id);
create index if not exists idx_assessment_attempts_status     on public.assessment_attempts(status);


-- -----------------------------------------------------------------------------
-- 25. student_answers
-- one answer row per question per attempt.
-- selected_options → mcq / true_false (array of question_options.id)
-- text_answer      → essay / short_answer / fill_blank
-- marks_awarded supports partial credit for essay grading.
-- -----------------------------------------------------------------------------
create table if not exists public.student_answers (
    id               uuid            not null default uuid_generate_v4(),
    attempt_id       uuid            not null,      -- fk → assessment_attempts.id
    question_id      uuid            not null,      -- fk → questions.id
    selected_options uuid[],                        -- array of question_options.id
    text_answer      text,
    is_correct       boolean,                       -- null = pending manual grading
    marks_awarded    decimal(4,2)    not null default 0,
    instructor_note  text,
    graded_at        timestamptz,

    constraint pk_student_answers
        primary key (id),
    constraint uq_student_answers
        unique (attempt_id, question_id),
    constraint fk_student_answers_attempt
        foreign key (attempt_id)
        references public.assessment_attempts(id)
        on delete cascade,
    constraint fk_student_answers_question
        foreign key (question_id)
        references public.questions(id)
        on delete cascade,
    constraint chk_student_answers_marks
        check (marks_awarded >= 0)
);

create index if not exists idx_student_answers_attempt  on public.student_answers(attempt_id);
create index if not exists idx_student_answers_question on public.student_answers(question_id);


-- =============================================================================
--  module 7 — assignments
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 26. assignments
-- file/text submission tasks set by instructors.
-- placed in modules via course_module_items (item_type = 'assignment').
-- instructor reviews and grades manually.
-- -----------------------------------------------------------------------------
create table if not exists public.assignments (
    id               uuid            not null default uuid_generate_v4(),
    offering_id      uuid            not null,      -- fk → course_offerings.id
    created_by       uuid            not null,      -- fk → users.id (instructor)
    title            text            not null,
    brief            text            not null,      -- full instructions (html)
    max_score        smallint        not null default 100,
    pass_score       smallint        not null default 50,
    weight_pct       decimal(5,2)    not null default 0,
    allow_files      boolean         not null default true,
    allowed_types    text,
    max_file_mb      smallint                default 10,
    allow_text       boolean         not null default false,
    due_date         timestamptz     not null,
    late_allowed     boolean         not null default false,
    late_penalty_pct decimal(4,2)            default 0,
    status           text            not null default 'draft'
        check (status in ('draft','published','closed')),
    created_at       timestamptz     not null default now(),
    updated_at       timestamptz     not null default now(),

    constraint pk_assignments
        primary key (id),
    constraint fk_assignments_offering
        foreign key (offering_id)
        references public.course_offerings(id)
        on delete cascade,
    constraint fk_assignments_created_by
        foreign key (created_by)
        references public.users(id)
        on delete restrict,
    constraint chk_assignments_pass
        check (pass_score <= max_score),
    constraint chk_assignments_weight
        check (weight_pct between 0 and 100)
);

-- add deferred fk: course_module_items → assignments (table now exists)
do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'fk_cmi_assignment'
    ) then
        alter table public.course_module_items
            add constraint fk_cmi_assignment
                foreign key (assignment_id)
                references public.assignments(id)
                on delete cascade;
    end if;
end;
$$;

create index if not exists idx_assignments_offering on public.assignments(offering_id);
create index if not exists idx_assignments_status   on public.assignments(status);

create or replace trigger trg_assignments_updated_at
    before update on public.assignments
    for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 27. assignment_submissions
-- one submission per student per assignment.
-- final_score = score - penalty_applied for late submissions.
-- -----------------------------------------------------------------------------
create table if not exists public.assignment_submissions (
    id               uuid            not null default uuid_generate_v4(),
    assignment_id    uuid            not null,      -- fk → assignments.id
    student_id       uuid            not null,      -- fk → users.id
    enrollment_id    uuid            not null,      -- fk → enrollments.id
    text_body        text,
    file_urls        text[],                        -- array of storage file urls
    is_late          boolean         not null default false,
    status           text            not null default 'submitted'
        check (status in ('submitted','grading','graded','resubmit_required')),
    score            decimal(5,2),
    penalty_applied  decimal(5,2)            default 0,
    final_score      decimal(5,2),                 -- score - penalty_applied
    feedback         text,
    graded_by        uuid,                          -- fk → users.id
    submitted_at     timestamptz     not null default now(),
    graded_at        timestamptz,

    constraint pk_assignment_submissions
        primary key (id),
    constraint uq_assignment_submissions
        unique (assignment_id, student_id),
    constraint fk_assignment_submissions_assignment
        foreign key (assignment_id)
        references public.assignments(id)
        on delete cascade,
    constraint fk_assignment_submissions_student
        foreign key (student_id)
        references public.users(id)
        on delete cascade,
    constraint fk_assignment_submissions_enrollment
        foreign key (enrollment_id)
        references public.enrollments(id)
        on delete cascade,
    constraint fk_assignment_submissions_graded_by
        foreign key (graded_by)
        references public.users(id)
        on delete set null,
    constraint chk_assignment_submissions_score
        check (score is null or score >= 0)
);

create index if not exists idx_assignment_submissions_assignment on public.assignment_submissions(assignment_id);
create index if not exists idx_assignment_submissions_student    on public.assignment_submissions(student_id);
create index if not exists idx_assignment_submissions_status     on public.assignment_submissions(status);


-- =============================================================================
--  module 8 — grades
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 28. grades
-- simple per-item score record. one row per student per graded item.
-- supports both assessments and assignments via two nullable fk columns.
-- exactly one of assessment_id or assignment_id must be set (check constraint).
--
-- grades = raw score (john scored 85 out of 100)
-- gradebook_items = weighted official record (8.5 weighted, letter = a)
-- -----------------------------------------------------------------------------
create table if not exists public.grades (
    id              uuid            not null default uuid_generate_v4(),
    student_id      uuid            not null,       -- fk → users.id
    enrollment_id   uuid            not null,       -- fk → enrollments.id
    assessment_id   uuid,                           -- fk → assessments.id (set if assessment)
    assignment_id   uuid,                           -- fk → assignments.id (set if assignment)
    attempt_id      uuid,                           -- fk → assessment_attempts.id (for assessments)
    raw_score       decimal(5,2)    not null default 0,
    total_marks     smallint        not null,
    score_pct       decimal(5,2)    not null default 0,
    passed          boolean         not null default false,
    recorded_at     timestamptz     not null default now(),
    updated_at      timestamptz     not null default now(),

    constraint pk_grades
        primary key (id),
    -- one grade per student per assessment
    constraint uq_grades_assessment
        unique (student_id, assessment_id),
    -- one grade per student per assignment
    constraint uq_grades_assignment
        unique (student_id, assignment_id),
    constraint fk_grades_student
        foreign key (student_id)
        references public.users(id)
        on delete cascade,
    constraint fk_grades_enrollment
        foreign key (enrollment_id)
        references public.enrollments(id)
        on delete cascade,
    constraint fk_grades_assessment
        foreign key (assessment_id)
        references public.assessments(id)
        on delete cascade,
    constraint fk_grades_assignment
        foreign key (assignment_id)
        references public.assignments(id)
        on delete cascade,
    constraint fk_grades_attempt
        foreign key (attempt_id)
        references public.assessment_attempts(id)
        on delete set null,
    -- exactly one of assessment_id or assignment_id must be set
    constraint chk_grades_item
        check (
            (assessment_id is not null and assignment_id is null)
            or
            (assignment_id is not null and assessment_id is null)
        ),
    constraint chk_grades_raw_score
        check (raw_score >= 0),
    constraint chk_grades_score_pct
        check (score_pct between 0 and 100)
);

create index if not exists idx_grades_student    on public.grades(student_id);
create index if not exists idx_grades_enrollment on public.grades(enrollment_id);
create index if not exists idx_grades_assessment on public.grades(assessment_id);
create index if not exists idx_grades_assignment on public.grades(assignment_id);

create or replace trigger trg_grades_updated_at
    before update on public.grades
    for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 29. gradebook_items
-- official weighted grade record per student per graded item.
-- source of truth for transcript and final course grade.
-- supports both assessments and assignments via two nullable fk columns.
-- exactly one of assessment_id or assignment_id must be set (check constraint).
--
-- flow:
--   grades (raw_score = 85)
--     ↓
--   gradebook_items (weighted_score = 8.5, letter_grade = 'A')
--     ↓
--   sum(weighted_score) per enrollment → enrollments.final_score
--     ↓
--   transcript / gpa
--
-- is_overridden = true: instructor manually changed grade.
-- override_by + override_note are required when is_overridden = true.
-- -----------------------------------------------------------------------------
create table if not exists public.gradebook_items (
    id              uuid            not null default uuid_generate_v4(),
    enrollment_id   uuid            not null,       -- fk → enrollments.id
    assessment_id   uuid,                           -- fk → assessments.id (set if assessment)
    assignment_id   uuid,                           -- fk → assignments.id (set if assignment)
    grade_id        uuid,                           -- fk → grades.id
    raw_score       decimal(5,2)    not null default 0,
    weight_pct      decimal(5,2)    not null default 0,
    weighted_score  decimal(5,2)    not null default 0, -- raw_score * weight_pct / 100
    letter_grade    text,
    is_overridden   boolean         not null default false,
    override_by     uuid,                           -- fk → users.id
    override_note   text,
    recorded_at     timestamptz     not null default now(),
    updated_at      timestamptz     not null default now(),

    constraint pk_gradebook_items
        primary key (id),
    -- one gradebook entry per enrollment per assessment
    constraint uq_gradebook_items_assessment
        unique (enrollment_id, assessment_id),
    -- one gradebook entry per enrollment per assignment
    constraint uq_gradebook_items_assignment
        unique (enrollment_id, assignment_id),
    constraint fk_gradebook_items_enrollment
        foreign key (enrollment_id)
        references public.enrollments(id)
        on delete cascade,
    constraint fk_gradebook_items_assessment
        foreign key (assessment_id)
        references public.assessments(id)
        on delete cascade,
    constraint fk_gradebook_items_assignment
        foreign key (assignment_id)
        references public.assignments(id)
        on delete cascade,
    constraint fk_gradebook_items_grade
        foreign key (grade_id)
        references public.grades(id)
        on delete set null,
    constraint fk_gradebook_items_override_by
        foreign key (override_by)
        references public.users(id)
        on delete set null,
    -- exactly one of assessment_id or assignment_id must be set
    constraint chk_gradebook_items_item
        check (
            (assessment_id is not null and assignment_id is null)
            or
            (assignment_id is not null and assessment_id is null)
        ),
    constraint chk_gradebook_items_letter
        check (letter_grade is null or letter_grade in ('A','B','C','D','F')),
    constraint chk_gradebook_items_weight
        check (weight_pct between 0 and 100),
    constraint chk_gradebook_items_scores
        check (raw_score >= 0 and weighted_score >= 0),
    constraint chk_gradebook_items_override
        check (
            (is_overridden = false)
            or
            (is_overridden = true
                and override_by is not null
                and override_note is not null)
        )
);

create index if not exists idx_gradebook_items_enrollment  on public.gradebook_items(enrollment_id);
create index if not exists idx_gradebook_items_assessment  on public.gradebook_items(assessment_id);
create index if not exists idx_gradebook_items_assignment  on public.gradebook_items(assignment_id);

create or replace trigger trg_gradebook_items_updated_at
    before update on public.gradebook_items
    for each row execute function public.set_updated_at();


-- =============================================================================
--  module 9 — live sessions & communication
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 30. live_session_attendance
-- detailed join/leave log per student per live session.
-- -----------------------------------------------------------------------------
create table if not exists public.live_session_attendance (
    id               uuid        not null default uuid_generate_v4(),
    live_session_id  uuid        not null,          -- fk → live_sessions.id
    student_id       uuid        not null,          -- fk → users.id
    joined_at        timestamptz,
    left_at          timestamptz,
    duration_mins    smallint,

    constraint pk_live_session_attendance
        primary key (id),
    constraint uq_live_session_attendance
        unique (live_session_id, student_id),
    constraint fk_live_session_attendance_session
        foreign key (live_session_id)
        references public.live_sessions(id)
        on delete cascade,
    constraint fk_live_session_attendance_student
        foreign key (student_id)
        references public.users(id)
        on delete cascade
);

create index if not exists idx_live_session_attendance_session on public.live_session_attendance(live_session_id);
create index if not exists idx_live_session_attendance_student on public.live_session_attendance(student_id);


-- -----------------------------------------------------------------------------
-- 31. announcements
-- course-level or institution-wide announcements.
-- offering_id = null means institution-wide broadcast.
-- -----------------------------------------------------------------------------
create table if not exists public.announcements (
    id           uuid        not null default uuid_generate_v4(),
    offering_id  uuid,                              -- fk → course_offerings.id; null = global
    author_id    uuid        not null,              -- fk → users.id
    title        text        not null,
    body         text        not null,
    is_pinned    boolean     not null default false,
    send_email   boolean     not null default false,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),

    constraint pk_announcements
        primary key (id),
    constraint fk_announcements_offering
        foreign key (offering_id)
        references public.course_offerings(id)
        on delete cascade,
    constraint fk_announcements_author
        foreign key (author_id)
        references public.users(id)
        on delete restrict
);

create index if not exists idx_announcements_offering on public.announcements(offering_id);
create index if not exists idx_announcements_author   on public.announcements(author_id);

create or replace trigger trg_announcements_updated_at
    before update on public.announcements
    for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- 32. forum_threads
-- discussion threads per course offering.
-- -----------------------------------------------------------------------------
create table if not exists public.forum_threads (
    id            uuid        not null default uuid_generate_v4(),
    offering_id   uuid        not null,             -- fk → course_offerings.id
    author_id     uuid        not null,             -- fk → users.id
    title         text        not null,
    is_pinned     boolean     not null default false,
    is_locked     boolean     not null default false,
    reply_count   integer     not null default 0,
    created_at    timestamptz not null default now(),
    last_reply_at timestamptz,

    constraint pk_forum_threads
        primary key (id),
    constraint fk_forum_threads_offering
        foreign key (offering_id)
        references public.course_offerings(id)
        on delete cascade,
    constraint fk_forum_threads_author
        foreign key (author_id)
        references public.users(id)
        on delete restrict,
    constraint chk_forum_threads_reply_count
        check (reply_count >= 0)
);

create index if not exists idx_forum_threads_offering on public.forum_threads(offering_id);


-- -----------------------------------------------------------------------------
-- 33. forum_posts
-- replies inside a thread.
-- parent_id enables nested replies (reply to a reply).
-- deleted_at = soft delete (row stays, content hidden).
-- -----------------------------------------------------------------------------
create table if not exists public.forum_posts (
    id          uuid        not null default uuid_generate_v4(),
    thread_id   uuid        not null,               -- fk → forum_threads.id
    parent_id   uuid,                               -- fk → forum_posts.id; null = top-level
    author_id   uuid        not null,               -- fk → users.id
    body        text        not null,
    is_answer   boolean     not null default false,
    upvotes     integer     not null default 0,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    deleted_at  timestamptz,

    constraint pk_forum_posts
        primary key (id),
    constraint fk_forum_posts_thread
        foreign key (thread_id)
        references public.forum_threads(id)
        on delete cascade,
    constraint fk_forum_posts_parent
        foreign key (parent_id)
        references public.forum_posts(id)
        on delete cascade,
    constraint fk_forum_posts_author
        foreign key (author_id)
        references public.users(id)
        on delete restrict,
    constraint chk_forum_posts_upvotes
        check (upvotes >= 0)
);

create index if not exists idx_forum_posts_thread on public.forum_posts(thread_id);
create index if not exists idx_forum_posts_parent on public.forum_posts(parent_id);

create or replace trigger trg_forum_posts_updated_at
    before update on public.forum_posts
    for each row execute function public.set_updated_at();


-- =============================================================================
--  module 10 — notifications, certificates, audit
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 34. notifications
-- in-app notification inbox per user.
-- is_read consistency enforced by check constraint.
-- partial index on unread notifications for fast badge count queries.
-- -----------------------------------------------------------------------------
create table if not exists public.notifications (
    id          uuid        not null default uuid_generate_v4(),
    user_id     uuid        not null,               -- fk → users.id
    type        text        not null,
    title       text        not null,
    body        text        not null,
    link        text,                               -- deep link to relevant page
    is_read     boolean     not null default false,
    read_at     timestamptz,
    created_at  timestamptz not null default now(),

    constraint pk_notifications
        primary key (id),
    constraint fk_notifications_user
        foreign key (user_id)
        references public.users(id)
        on delete cascade,
    constraint chk_notifications_type
        check (type in (
            'exam_published','grade_released','submission_graded',
            'assignment_due','announcement','live_session_reminder',
            'enrollment_confirmed','grade_override'
        )),
    constraint chk_notifications_read
        check (
            (is_read = false and read_at is null)
            or
            (is_read = true  and read_at is not null)
        )
);

create index if not exists idx_notifications_user   on public.notifications(user_id);
-- partial index: only unread rows — fast badge count with WHERE is_read = false
create index if not exists idx_notifications_unread
    on public.notifications(user_id)
    where is_read = false;


-- -----------------------------------------------------------------------------
-- 35. certificates
-- issued to students on successful course completion.
-- unique_code is publicly verifiable on institution website.
-- one certificate per enrollment enforced by unique constraint.
-- -----------------------------------------------------------------------------
create table if not exists public.certificates (
    id              uuid        not null default uuid_generate_v4(),
    student_id      uuid        not null,           -- fk → users.id
    enrollment_id   uuid        not null,           -- fk → enrollments.id
    offering_id     uuid        not null,           -- fk → course_offerings.id
    unique_code     text        not null,           -- e.g. 'cert-cs301-2025-00042'
    pdf_url         text,
    issued_at       timestamptz not null default now(),
    expires_at      timestamptz,
    revoked_at      timestamptz,
    revoke_reason   text,

    constraint pk_certificates
        primary key (id),
    constraint uq_certificates_enrollment
        unique (enrollment_id),
    constraint uq_certificates_code
        unique (unique_code),
    constraint fk_certificates_student
        foreign key (student_id)
        references public.users(id)
        on delete restrict,
    constraint fk_certificates_enrollment
        foreign key (enrollment_id)
        references public.enrollments(id)
        on delete restrict,
    constraint fk_certificates_offering
        foreign key (offering_id)
        references public.course_offerings(id)
        on delete restrict,
    constraint chk_certificates_revoke
        check (
            (revoked_at is null and revoke_reason is null)
            or
            (revoked_at is not null and revoke_reason is not null)
        )
);

create index if not exists idx_certificates_student    on public.certificates(student_id);
create index if not exists idx_certificates_enrollment on public.certificates(enrollment_id);


-- -----------------------------------------------------------------------------
-- 36. audit_logs
-- append-only immutable audit trail for all admin + grade actions.
-- never update or delete rows in this table.
-- old_value / new_value store jsonb snapshots of changed data.
-- -----------------------------------------------------------------------------
create table if not exists public.audit_logs (
    id           uuid        not null default uuid_generate_v4(),
    actor_id     uuid,                              -- fk → users.id; null = system action
    action       text        not null,              -- e.g. 'grade.override', 'user.create'
    table_name   text        not null,              -- e.g. 'gradebook_items', 'users'
    record_id    uuid        not null,              -- pk of the affected row
    old_value    jsonb,                             -- snapshot before change
    new_value    jsonb,                             -- snapshot after change
    ip_address   text,
    user_agent   text,
    created_at   timestamptz not null default now(),

    constraint pk_audit_logs
        primary key (id),
    constraint fk_audit_logs_actor
        foreign key (actor_id)
        references public.users(id)
        on delete set null,
    constraint chk_audit_logs_action
        check (action in (
            'user.create','user.update','user.suspend',
            'enrollment.create','enrollment.drop',
            'grade.override','grade.release',
            'offering.create','offering.cancel',
            'certificate.issue','certificate.revoke',
            'term.activate','term.close'
        ))
);

-- audit_logs is append-only — no updated_at trigger needed
create index if not exists idx_audit_logs_actor      on public.audit_logs(actor_id);
create index if not exists idx_audit_logs_table      on public.audit_logs(table_name, record_id);
create index if not exists idx_audit_logs_action     on public.audit_logs(action);
create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at);


-- =============================================================================
--  triggers — enrolled_count auto-maintenance
-- =============================================================================
-- keeps course_offerings.enrolled_count in sync with enrollments rows.
-- fires on: insert (active enrollment), delete, or status change to/from dropped.
-- =============================================================================

create or replace function public.sync_enrolled_count()
returns trigger
language plpgsql
as $$
begin
    if (tg_op = 'INSERT') then
        -- new active enrollment: increment
        if new.status = 'active' then
            update public.course_offerings
               set enrolled_count = enrolled_count + 1
             where id = new.offering_id;
        end if;

    elsif (tg_op = 'DELETE') then
        -- enrollment deleted: decrement if it was active
        if old.status = 'active' then
            update public.course_offerings
               set enrolled_count = greatest(enrolled_count - 1, 0)
             where id = old.offering_id;
        end if;

    elsif (tg_op = 'UPDATE') then
        -- status changed from active to dropped/failed/completed
        if old.status = 'active' and new.status != 'active' then
            update public.course_offerings
               set enrolled_count = greatest(enrolled_count - 1, 0)
             where id = new.offering_id;
        -- status changed back to active (re-enrollment)
        elsif old.status != 'active' and new.status = 'active' then
            update public.course_offerings
               set enrolled_count = enrolled_count + 1
             where id = new.offering_id;
        end if;
    end if;

    return null;
end;
$$;

create or replace trigger trg_sync_enrolled_count
    after insert or update or delete on public.enrollments
    for each row execute function public.sync_enrolled_count();


-- =============================================================================
--  end of schema — v6
-- =============================================================================
--
--  tables    : 36
--  triggers  : set_updated_at on 20 tables + sync_enrolled_count
--  indexes   : 90+
--  constraints per table: pk_ + uq_ + fk_ + chk_
--
--  key fixes from v5:
--    ✅ student_registrations dropped
--    ✅ lessons = content only (video|document|link|scorm)
--    ✅ attachments = fully generic (no entity_type/entity_id)
--    ✅ lesson_materials = clean link table (lesson_id → attachment_id)
--    ✅ grades + gradebook_items support assessment_id AND assignment_id
--    ✅ uq_one_current_term enforces single current term
--    ✅ uq_users_email_lower case-insensitive email uniqueness
--    ✅ set_updated_at() shared trigger on all updated_at tables
--    ✅ enrolled_count auto-maintained by trigger
--    ✅ audit_logs table for admin + grade actions
--
--  relationship summary:
--    users ───────────────────────► admin_profiles          (1:1)
--    users ───────────────────────► instructor_profiles     (1:1)
--    users ───────────────────────► student_profiles        (1:1)
--    departments ─────────────────► courses                 (1:m)
--    departments ─────────────────► academic_programs       (1:m)
--    academic_terms ──────────────► course_offerings        (1:m)
--    courses ─────────────────────► course_offerings        (1:m)
--    course_offerings ────────────► course_instructors      (1:m)
--    course_offerings ────────────► course_modules          (1:m)
--    course_modules ──────────────► course_module_items     (1:m)
--    course_module_items ─────────► lessons                 (m:1)
--    course_module_items ─────────► assessments             (m:1)
--    course_module_items ─────────► assignments             (m:1)
--    course_module_items ─────────► live_sessions           (m:1)
--    lessons ─────────────────────► lesson_materials        (1:m)
--    lesson_materials ────────────► attachments             (m:1)
--    enrollments = users × course_offerings                 (m:m junction)
--    enrollments ─────────────────► lesson_progress         (1:m)
--    enrollments ─────────────────► attendance              (1:m)
--    assessments ─────────────────► assessment_attempts     (1:m)
--    assessment_attempts ─────────► student_answers         (1:m)
--    grades supports: assessment_id OR assignment_id        (strict 2-fk)
--    gradebook_items supports: assessment_id OR assignment_id
--    enrollments ─────────────────► gradebook_items         (1:m)
--    assignments ─────────────────► assignment_submissions  (1:m)
--    forum_threads ───────────────► forum_posts             (1:m)
--    forum_posts ─────────────────► forum_posts (self)      (nested)
--    enrollments ─────────────────► certificates            (1:1)
-- =============================================================================
