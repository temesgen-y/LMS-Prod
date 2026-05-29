-- Add 'assignment_resubmit' to the allowed notification types.
-- The instructor "Request Resubmit" action sends a notification of this type; without
-- it the insert fails the chk_notifications_type CHECK constraint.
-- ('assignment_graded' is intentionally NOT added — grading uses the existing
-- 'submission_graded' type.)

ALTER TABLE public.notifications
    DROP CONSTRAINT IF EXISTS chk_notifications_type;

ALTER TABLE public.notifications
    ADD CONSTRAINT chk_notifications_type CHECK (type IN (
        'exam_published','grade_released','submission_graded',
        'assignment_due','announcement','live_session_reminder',
        'enrollment_confirmed','grade_override','payment_due',
        'assignment_resubmit'
    ));
