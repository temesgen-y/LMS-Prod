-- ---------------------------------------------------------------------------
-- Fix duplicate sort_order values in course_modules and course_module_items
-- Re-sequences them within each partition using row_number().
-- ---------------------------------------------------------------------------

-- Fix course_modules sort_order per offering
with ranked as (
    select id,
           row_number() over (
               partition by offering_id
               order by sort_order, created_at
           ) - 1 as new_order
    from public.course_modules
)
update public.course_modules cm
set sort_order = ranked.new_order
from ranked
where cm.id = ranked.id;

-- Fix course_module_items sort_order per module
with ranked as (
    select id,
           row_number() over (
               partition by module_id
               order by sort_order, created_at
           ) - 1 as new_order
    from public.course_module_items
)
update public.course_module_items cmi
set sort_order = ranked.new_order
from ranked
where cmi.id = ranked.id;

-- Grant UPDATE on course_modules and course_module_items to authenticated
-- (needed so set_updated_at trigger can write updated_at)
grant update on public.course_modules to authenticated;
grant update on public.course_module_items to authenticated;
grant insert on public.course_modules to authenticated;
grant insert on public.course_module_items to authenticated;
grant delete on public.course_modules to authenticated;
grant delete on public.course_module_items to authenticated;
grant select on public.course_modules to authenticated;
grant select on public.course_module_items to authenticated;
grant select on public.lessons to authenticated;
grant insert on public.lessons to authenticated;
grant update on public.lessons to authenticated;
grant delete on public.lessons to authenticated;
