import type { SupabaseClient } from '@supabase/supabase-js';

export interface PrereqResult {
  prerequisite_id: string;
  course_code: string;
  course_title: string;
  required_grade: string;
  prereq_type: string;
  is_met: boolean;
}

export interface PrereqCheckResult {
  allMet: boolean;
  allHardMet: boolean;
  results: PrereqResult[];
  hasPrereqs: boolean;
}

export const checkPrerequisites = async (
  supabase: SupabaseClient,
  studentId: string,
  offeringId: string,
): Promise<PrereqCheckResult> => {
  const { data, error } = await supabase.rpc('check_student_prerequisites', {
    p_student_id: studentId,
    p_offering_id: offeringId,
  });
  if (error || !data) {
    return { allMet: true, allHardMet: true, results: [], hasPrereqs: false };
  }
  const results = data as PrereqResult[];
  const allMet = results.every(r => r.is_met);
  const allHardMet = results.filter(r => r.prereq_type === 'hard').every(r => r.is_met);
  return { allMet, allHardMet, results, hasPrereqs: results.length > 0 };
};
