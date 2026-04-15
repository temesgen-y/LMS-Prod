import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as service from '../services/staff.service';

export const createStaff = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const {
      email,
      password,
      first_name,
      last_name,
      role,
      staff_no,
      department,
      specialization,
      access_level,
    } = req.body;

    const result = await service.createStaffUser(
      email,
      password,
      first_name,
      last_name,
      role,
      staff_no ?? null,
      department ?? null,
      specialization ?? null,
      access_level ?? null,
      req.user!.id,
    );

    res.json({ success: true, user_id: result.userId, message: `${role} account created successfully.` });
  } catch (err) {
    next(err);
  }
};
