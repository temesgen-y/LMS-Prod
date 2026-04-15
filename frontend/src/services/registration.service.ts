import { api } from '@/lib/api';

export const approveRegistration = async (
  requestId: string,
  studentId: string,
  offeringId: string,
  isOverride = false,
  overrideReason = '',
  courseCode?: string,
) =>
  api.post(`/registration/${requestId}/approve`, {
    studentId,
    offeringId,
    isOverride,
    overrideReason,
    courseCode,
  });

export const rejectRegistration = async (
  requestId: string,
  studentId: string,
  reason: string,
  courseCode?: string,
) =>
  api.post(`/registration/${requestId}/reject`, { studentId, reason, courseCode });

export const checkPrerequisites = async (studentId: string, offeringId: string) =>
  api.get(`/registration/prerequisites?studentId=${studentId}&offeringId=${offeringId}`);

export const approveAddDrop = async (
  requestId: string,
  studentId: string,
  offeringId: string,
  type: 'add' | 'drop',
) => api.post(`/registration/${requestId}/approve-drop`, { studentId, offeringId, type });
