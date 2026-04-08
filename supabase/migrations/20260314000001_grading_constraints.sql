-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: grading_constraints
-- Fixes constraint violations and adds support for extended letter grades
-- ─────────────────────────────────────────────────────────────────────────────

-- Fix 1: assessments — auto-calculate pass_mark (50% of total_marks)
-- Set default to 0 so inserts without pass_mark don't fail before the
-- app sets it. The app always sends pass_mark = Math.round(total_marks * 0.5).
alter table public.assessments
    alter column pass_mark set default 0;

alter table public.assessments
    drop constraint if exists chk_assessments_pass_lte_total;

alter table public.assessments
    add constraint chk_assessments_pass_lte_total
        check (pass_mark >= 0 and pass_mark <= total_marks);


-- Fix 2: enrollments — expand final_grade to support all letter grades
-- Previous constraint only allowed: 'A','B','C','D','F','I'
alter table public.enrollments
    drop constraint if exists chk_enrollments_final_grade;

alter table public.enrollments
    add constraint chk_enrollments_final_grade
        check (
            final_grade is null
            or final_grade in (
                'A', 'A-',
                'B+', 'B', 'B-',
                'C+', 'C',
                'D',
                'F',
                'I'   -- incomplete
            )
        );


-- Fix 3: gradebook_items — expand letter_grade to support all letter grades
alter table public.gradebook_items
    drop constraint if exists chk_gradebook_items_letter;

alter table public.gradebook_items
    add constraint chk_gradebook_items_letter
        check (
            letter_grade is null
            or letter_grade in (
                'A', 'A-',
                'B+', 'B', 'B-',
                'C+', 'C',
                'D',
                'F'
            )
        );
