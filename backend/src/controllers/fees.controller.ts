import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as service from '../services/fees.service';

export const recordPayment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const {
      studentId,
      termId,
      feeAccountId,
      amount,
      paymentMethod,
      referenceNo,
      paymentDate,
      notes,
    } = req.body;

    const result = await service.recordPayment(
      studentId,
      termId,
      feeAccountId,
      amount,
      paymentMethod,
      referenceNo ?? null,
      paymentDate,
      notes ?? null,
      req.user!.id,
    );

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};
