import { createClient } from '@/lib/supabase/client';

/**
 * Returns the next sort_order value for a new module
 * in the given offering (MAX existing + 1, or 0 if none).
 */
export async function getNextModuleOrder(offeringId: string): Promise<number> {
  const supabase = createClient();
  const { data } = await supabase
    .from('course_modules')
    .select('sort_order')
    .eq('offering_id', offeringId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single();
  return (data?.sort_order ?? -1) + 1;
}

/**
 * Returns the next sort_order value for a new item
 * in the given module (MAX existing + 1, or 0 if none).
 */
export async function getNextItemOrder(moduleId: string): Promise<number> {
  const supabase = createClient();
  const { data } = await supabase
    .from('course_module_items')
    .select('sort_order')
    .eq('module_id', moduleId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single();
  return (data?.sort_order ?? -1) + 1;
}
