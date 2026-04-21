-- Add payment_due to the notifications type check constraint
alter table public.notifications
  drop constraint if exists chk_notifications_type;

alter table public.notifications
  add constraint chk_notifications_type check (type in (
    'exam_published','grade_released','submission_graded',
    'assignment_due','announcement','live_session_reminder',
    'enrollment_confirmed','grade_override','payment_due'
  ));
