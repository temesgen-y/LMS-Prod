import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as service from '../services/grading.service';

export const upsertGradebookItem = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const {
      enrollmentId,
      itemId,
      itemType,
      rawScore,
      totalMarks,
      isOverride,
      overrideNote,
    } = req.body;

    await service.upsertGradebookItem(
      enrollmentId,
      itemId,
      itemType,
      rawScore,
      totalMarks,
      req.user!.id,
      isOverride ?? false,
      overrideNote ?? '',
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

export const recalculateFinalGrade = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    await service.recalculateFinalGrade(String(req.params.enrollmentId));
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
