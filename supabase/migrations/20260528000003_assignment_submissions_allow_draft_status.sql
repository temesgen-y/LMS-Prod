-- Allow the 'draft' status on assignment_submissions.
-- Migration 20260523000001 added draft_text / draft_saved_at columns for the draft
-- auto-save feature, but never widened the status CHECK constraint. The original
-- constraint only permitted ('submitted','grading','graded','resubmit_required'),
-- so any attempt to save a draft (frontend auto-save, or the pre-submission internet
-- plagiarism check) fails with:
--   new row for relation "assignment_submissions" violates check constraint
--   "assignment_submissions_status_check"

ALTER TABLE public.assignment_submissions
    DROP CONSTRAINT IF EXISTS assignment_submissions_status_check;

ALTER TABLE public.assignment_submissions
    ADD CONSTRAINT assignment_submissions_status_check
    CHECK (status IN ('draft','submitted','grading','graded','resubmit_required'));
