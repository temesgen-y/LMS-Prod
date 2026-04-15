import { api } from '@/lib/api';

export const upsertGradebookItem = async (
  enrollmentId: string,
  itemId: string,
  itemType: 'assessment' | 'assignment',
  rawScore: number,
  totalMarks: number,
  isOverride = false,
  overrideNote = '',
) =>
  api.post('/grading/gradebook-item', {
    enrollmentId,
    itemId,
    itemType,
    rawScore,
    totalMarks,
    isOverride,
    overrideNote,
  });

export const recalculateFinalGrade = async (enrollmentId: string) =>
  api.post(`/grading/recalculate/${enrollmentId}`, {});
