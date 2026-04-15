import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as service from '../services/registration.service';

export const checkPrerequisites = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const studentId = String(req.query.studentId ?? '');
    const offeringId = String(req.query.offeringId ?? '');
    const result = await service.checkPrerequisites(studentId, offeringId);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
};

export const approveRequest = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { studentId, offeringId, isOverride, overrideReason } = req.body;
    await service.approveRegistration(
      String(req.params.id),
      studentId,
      offeringId,
      req.user!.id,
      isOverride,
      overrideReason,
    );
    res.json({ success: true, message: 'Registration approved' });
  } catch (err) {
    next(err);
  }
};

export const rejectRequest = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { studentId, reason, courseCode } = req.body;
    await service.rejectRegistration(
      String(req.params.id),
      studentId,
      req.user!.id,
      reason,
      courseCode,
    );
    res.json({ success: true, message: 'Registration rejected' });
  } catch (err) {
    next(err);
  }
};

export const approveAddDrop = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { studentId, offeringId, type } = req.body;
    const reqId = String(req.params.id);
    if (type === 'add') {
      await service.approveRegistration(reqId, studentId, offeringId, req.user!.id, false, '');
    } else {
      await service.approveDropRequest(reqId, studentId, offeringId, req.user!.id);
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
