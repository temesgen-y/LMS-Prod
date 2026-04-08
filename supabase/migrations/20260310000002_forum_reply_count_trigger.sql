-- =============================================================================
-- Migration: Forum reply_count trigger + performance indexes
-- =============================================================================

-- ─── Function: update_forum_thread_reply_count ────────────────────────────────
-- Keeps forum_threads.reply_count and last_reply_at in sync with forum_posts.
--
-- Rules:
--  • INSERT → increment reply_count, set last_reply_at = NEW.created_at
--  • UPDATE where deleted_at transitions NULL → non-NULL → decrement (min 0)

create or replace function update_forum_thread_reply_count()
returns trigger
language plpgsql
as $$
begin
  if (TG_OP = 'INSERT') then
    update forum_threads
    set
      reply_count   = reply_count + 1,
      last_reply_at = NEW.created_at
    where id = NEW.thread_id;

  elsif (TG_OP = 'UPDATE') then
    -- Soft-delete: deleted_at changed from NULL to a non-null timestamp
    if (NEW.deleted_at is not null and OLD.deleted_at is null) then
      update forum_threads
      set reply_count = greatest(reply_count - 1, 0)
      where id = NEW.thread_id;
    end if;
  end if;

  return NEW;
end;
$$;

-- ─── Trigger: trg_forum_posts_reply_count ────────────────────────────────────

drop trigger if exists trg_forum_posts_reply_count on forum_posts;

create trigger trg_forum_posts_reply_count
after insert or update on forum_posts
for each row
execute function update_forum_thread_reply_count();

-- =============================================================================
-- Performance indexes
-- =============================================================================

-- forum_posts: most common query patterns
create index if not exists idx_forum_posts_thread_id
  on forum_posts (thread_id);

create index if not exists idx_forum_posts_parent_id
  on forum_posts (parent_id)
  where parent_id is not null;

create index if not exists idx_forum_posts_author_id
  on forum_posts (author_id);

create index if not exists idx_forum_posts_thread_created
  on forum_posts (thread_id, created_at asc);

create index if not exists idx_forum_posts_deleted_at
  on forum_posts (deleted_at)
  where deleted_at is null;

-- forum_threads: offering list + pinned sort
create index if not exists idx_forum_threads_offering_id
  on forum_threads (offering_id);

create index if not exists idx_forum_threads_offering_pinned
  on forum_threads (offering_id, is_pinned desc, created_at desc);

create index if not exists idx_forum_threads_author_id
  on forum_threads (author_id);
