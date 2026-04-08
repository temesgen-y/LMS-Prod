'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { createClient } from '@/lib/supabase/client';

export interface OfferingDetails {
  id: string;
  section_name: string;
  enrolled_count: number;
  status: string;
  courses: {
    code: string;
    title: string;
  } | null;
  academic_terms: {
    term_name: string;
    year_start: number;
    is_current: boolean;
  } | null;
}

interface InstructorCourseContextValue {
  activeOfferingId: string;
  setActiveOfferingId: (id: string) => void;
  activeOffering: OfferingDetails | null;
  allOfferings: OfferingDetails[];
  instructorId: string | null;
  loadingOfferings: boolean;
}

const InstructorCourseContext =
  createContext<InstructorCourseContextValue | null>(null);

export function InstructorCourseProvider({
  children,
  initialOfferingId,
  initialInstructorId,
}: {
  children: ReactNode;
  initialOfferingId?: string;
  initialInstructorId?: string;
}) {
  const [allOfferings, setAllOfferings] = useState<OfferingDetails[]>([]);
  const [activeOfferingId, setActiveOfferingId] = useState<string>(
    initialOfferingId ?? '',
  );
  const [instructorId, setInstructorId] = useState<string | null>(
    initialInstructorId ?? null,
  );
  const [loadingOfferings, setLoadingOfferings] = useState(true);

  const loadOfferings = useCallback(async (instId: string) => {
    const supabase = createClient();
    const { data } = await supabase
      .from('course_instructors')
      .select(`
        course_offerings (
          id,
          section_name,
          enrolled_count,
          status,
          courses ( code, title ),
          academic_terms ( term_name, year_start, is_current )
        )
      `)
      .eq('instructor_id', instId);

    if (data) {
      const offerings: OfferingDetails[] = (data as any[])
        .map((r) => r.course_offerings)
        .filter(Boolean)
        .map((o: any) => ({
          id: o.id,
          section_name: o.section_name ?? 'A',
          enrolled_count: o.enrolled_count ?? 0,
          status: o.status ?? 'active',
          courses: o.courses ?? null,
          academic_terms: o.academic_terms ?? null,
        }));

      // Sort: current term first
      offerings.sort((a, b) =>
        (b.academic_terms?.is_current ? 1 : 0) -
        (a.academic_terms?.is_current ? 1 : 0),
      );

      setAllOfferings(offerings);

      // Set active if not already set
      if (!initialOfferingId && offerings.length > 0) {
        setActiveOfferingId(offerings[0].id);
      }
    }
    setLoadingOfferings(false);
  }, [initialOfferingId]);

  useEffect(() => {
    const init = async () => {
      if (initialInstructorId) {
        await loadOfferings(initialInstructorId);
        return;
      }
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { setLoadingOfferings(false); return; }
      const { data: appUser } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', authData.user.id)
        .single();
      if (!appUser) { setLoadingOfferings(false); return; }
      const id = (appUser as any).id as string;
      setInstructorId(id);
      await loadOfferings(id);
    };
    init();
  }, [initialInstructorId, loadOfferings]);

  const activeOffering =
    allOfferings.find((o) => o.id === activeOfferingId) ?? null;

  return (
    <InstructorCourseContext.Provider
      value={{
        activeOfferingId,
        setActiveOfferingId,
        activeOffering,
        allOfferings,
        instructorId,
        loadingOfferings,
      }}
    >
      {children}
    </InstructorCourseContext.Provider>
  );
}

export function useInstructorCourse(): InstructorCourseContextValue {
  const ctx = useContext(InstructorCourseContext);
  if (!ctx) {
    throw new Error(
      'useInstructorCourse must be used inside InstructorCourseProvider',
    );
  }
  return ctx;
}
