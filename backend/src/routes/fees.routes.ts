import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as ctrl from '../controllers/fees.controller';

const router = Router();

router.use(requireAuth);

// POST /api/fees/payment
router.post(
  '/payment',
  requireRole('registrar', 'admin'),
  validate(
    z.object({
      studentId: z.string().uuid(),
      termId: z.string().uuid(),
      feeAccountId: z.string().uuid(),
      amount: z.number().positive(),
      paymentMethod: z.string().min(1),
      referenceNo: z.string().nullable().optional(),
      paymentDate: z.string().min(1),
      notes: z.string().nullable().optional(),
    }),
  ),
  ctrl.recordPayment,
);

export default router;
