import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as service from '../services/departments.service';

export const assignDeptHead = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    await service.assignDeptHead(req.body.instructorId, req.body.departmentId, req.user!.id);
    res.json({ success: true, message: 'Department head assigned' });
  } catch (err) {
    next(err);
  }
};

export const removeDeptHead = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    await service.removeDeptHead(req.body.departmentId);
    res.json({ success: true, message: 'Department head removed' });
  } catch (err) {
    next(err);
  }
};
