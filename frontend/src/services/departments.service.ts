import { api } from '@/lib/api';

export const assignDeptHead = async (instructorId: string, departmentId: string) =>
  api.post('/departments/assign-head', { instructorId, departmentId });

export const removeDeptHead = async (departmentId: string) =>
  api.post('/departments/remove-head', { departmentId });
