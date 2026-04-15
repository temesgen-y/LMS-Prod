import { api } from '@/lib/api';

export const approveLeave = async (requestId: string, reviewNote = '') =>
  api.post(`/leave/${requestId}/approve`, { reviewNote });

export const rejectLeave = async (requestId: string, reason: string) =>
  api.post(`/leave/${requestId}/reject`, { reason });
