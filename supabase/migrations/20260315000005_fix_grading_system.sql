-- =============================================================
-- Fix grading system: remove weight-based grading,
-- adopt marks-based grading (all items must sum to 100)
-- =============================================================

-- 1. Remove weight/grade columns from gradebook_items
alter table public.gradebook_items
    drop column if exists weight_pct;

alter table public.gradebook_items
    drop column if exists weighted_score;

-- Drop passed before score_pct (passed is a generated column that depends on score_pct)
alter table public.gradebook_items
    drop column if exists passed;

alter table public.gradebook_items
    drop column if exists score_pct;

alter table public.gradebook_items
    drop column if exists letter_grade;

alter table public.gradebook_items
    drop column if exists grade_id;

-- 2. Add total_marks if not already there
alter table public.gradebook_items
    add column if not exists total_marks decimal not null default 0;

-- 3. Fix unique constraints on gradebook_items
alter table public.gradebook_items
    drop constraint if exists uq_gradebook_items_assessment;

alter table public.gradebook_items
    drop constraint if exists uq_gradebook_items_assignment;

alter table public.gradebook_items
    add constraint uq_gradebook_items_assessment
        unique (enrollment_id, assessment_id);

alter table public.gradebook_items
    add constraint uq_gradebook_items_assignment
        unique (enrollment_id, assignment_id);

-- 4. Fix enrollments final_grade allowed values
alter table public.enrollments
    drop constraint if exists chk_enrollments_final_grade;

alter table public.enrollments
    add constraint chk_enrollments_final_grade
        check (
            final_grade is null or
            final_grade in (
                'A','A-','B+','B','B-',
                'C+','C','D','F','I'
            )
        );

-- 5. Zero out weight_pct (no longer used for grading)
update public.assessments
set weight_pct = 0
where weight_pct != 0;

update public.assignments
set weight_pct = 0
where weight_pct != 0;

-- 6. Backfill total_marks from assessments.total_marks
update public.gradebook_items gi
set total_marks = a.total_marks
from public.assessments a
where gi.assessment_id = a.id
  and gi.total_marks = 0;

-- 7. Backfill total_marks from assignments.max_score
update public.gradebook_items gi
set total_marks = asn.max_score
from public.assignments asn
where gi.assignment_id = asn.id
  and gi.total_marks = 0;

-- 8. Recalculate all enrollment final grades with new formula
--    final_score = SUM(raw_score) / SUM(total_marks) * 100  (capped at 100)

-- Drop the score range constraint first so we can safely update
alter table public.enrollments
    drop constraint if exists chk_enrollments_final_score;

update public.enrollments e
set
    final_score = subq.final_score,
    final_grade = case
        when subq.final_score >= 93 then 'A'
        when subq.final_score >= 90 then 'A-'
        when subq.final_score >= 87 then 'B+'
        when subq.final_score >= 83 then 'B'
        when subq.final_score >= 80 then 'B-'
        when subq.final_score >= 77 then 'C+'
        when subq.final_score >= 73 then 'C'
        when subq.final_score >= 60 then 'D'
        else 'F'
    end,
    updated_at = now()
from (
    select
        enrollment_id,
        case
            when sum(total_marks) > 0
            then least(
                round((sum(raw_score) / sum(total_marks)) * 100, 2),
                100.00
            )
            else 0
        end as final_score
    from public.gradebook_items
    group by enrollment_id
) subq
where e.id = subq.enrollment_id
  and subq.final_score > 0;

-- Re-add the constraint (capped at 100)
alter table public.enrollments
    add constraint chk_enrollments_final_score
        check (final_score >= 0 and final_score <= 100);
