// Shared TypeScript types for the backend

export interface ApiResponse<T = unknown> {
  data?: T;
  success?: boolean;
  message?: string;
  error?: string;
  code?: string;
}

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

export interface GradebookItemParams {
  enrollmentId: string;
  itemId: string;
  itemType: 'assessment' | 'assignment';
  rawScore: number;
  totalMarks: number;
  instructorId?: string;
  isOverride?: boolean;
  overrideNote?: string;
}

export type StaffRole = 'registrar' | 'department_head' | 'academic_advisor' | 'it_admin';
