import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as service from '../services/leave.service';

export const approveLeave = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    await service.approveLeave(String(req.params.id), req.user!.id, req.body.reviewNote ?? '');
    res.json({ success: true, message: 'Leave request approved' });
  } catch (err) {
    next(err);
  }
};

export const rejectLeave = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    await service.rejectLeave(String(req.params.id), req.user!.id, req.body.reason);
    res.json({ success: true, message: 'Leave request rejected' });
  } catch (err) {
    next(err);
  }
};
