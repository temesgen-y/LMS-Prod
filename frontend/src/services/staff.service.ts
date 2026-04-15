import { api } from '@/lib/api';

export interface CreateStaffParams {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  role: string;
  staff_no?: string;
  department?: string;
  specialization?: string;
  access_level?: string;
}

export const createStaffUser = async (params: CreateStaffParams) =>
  api.post('/staff/create', params);
