import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as service from '../services/standing.service';

export const recordStanding = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const {
      studentId,
      termId,
      gpa,
      cumulativeGpa,
      standing,
      creditsEarned,
      creditsAttempted,
      notes,
    } = req.body;

    await service.recordAcademicStanding(
      studentId,
      termId,
      gpa,
      cumulativeGpa,
      standing,
      creditsEarned,
      creditsAttempted,
      notes ?? null,
      req.user!.id,
    );

    res.json({ success: true, message: 'Academic standing recorded' });
  } catch (err) {
    next(err);
  }
};
