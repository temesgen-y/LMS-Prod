-- =============================================================================
--  Add start_date and end_date columns to forum_threads
--  run after 20260310000002_forum_reply_count_trigger.sql
-- =============================================================================

alter table public.forum_threads
    add column if not exists start_date date,
    add column if not exists end_date   date;
