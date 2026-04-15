import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as ctrl from '../controllers/standing.controller';

const router = Router();

router.use(requireAuth);

// POST /api/standing/record
router.post(
  '/record',
  requireRole('registrar', 'admin'),
  validate(
    z.object({
      studentId: z.string().uuid(),
      termId: z.string().uuid(),
      gpa: z.number().min(0).max(4),
      cumulativeGpa: z.number().min(0).max(4),
      standing: z.string().min(1),
      creditsEarned: z.number().min(0),
      creditsAttempted: z.number().min(0),
      notes: z.string().nullable().optional(),
    }),
  ),
  ctrl.recordStanding,
);

export default router;
