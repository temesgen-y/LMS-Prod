-- Backfill department_id on department_head_profiles rows where it is NULL
-- but departments.head_id points to that user.
-- This fixes stale rows created before the assignDeptHead upsert bug was fixed.

update public.department_head_profiles dhp
set department_id = d.id,
    updated_at    = now()
from public.departments d
where d.head_id    = dhp.user_id
  and dhp.department_id is null;
