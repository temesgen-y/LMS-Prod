'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export const useCourseTotalMarks = (offeringId: string) => {
  const [totalUsed, setTotalUsed] = useState(0);
  const [items,     setItems]     = useState<{ title: string; marks: number }[]>([]);
  const [loading,   setLoading]   = useState(false);

  const fetchTotal = useCallback(async () => {
    if (!offeringId) { setTotalUsed(0); setItems([]); return; }
    setLoading(true);
    const supabase = createClient();

    const [{ data: assessments }, { data: assignments }] = await Promise.all([
      supabase
        .from('assessments')
        .select('id, title, type, total_marks')
        .eq('offering_id', offeringId)
        .neq('status', 'archived'),
      supabase
        .from('assignments')
        .select('id, title, max_score')
        .eq('offering_id', offeringId)
        .neq('status', 'archived'),
    ]);

    const allItems = [
      ...((assessments ?? []) as any[]).map(a => ({ title: a.title ?? a.type, marks: a.total_marks ?? 0 })),
      ...((assignments ?? []) as any[]).map(a => ({ title: a.title ?? 'Assignment', marks: a.max_score ?? 0 })),
    ];

    const total = allItems.reduce((sum, i) => sum + i.marks, 0);
    setItems(allItems);
    setTotalUsed(total);
    setLoading(false);
  }, [offeringId]);

  useEffect(() => { fetchTotal(); }, [fetchTotal]);

  const remaining = 100 - totalUsed;
  const isValid   = totalUsed === 100;
  const isOver    = totalUsed > 100;

  return { totalUsed, remaining, isValid, isOver, items, loading, refetch: fetchTotal };
};
