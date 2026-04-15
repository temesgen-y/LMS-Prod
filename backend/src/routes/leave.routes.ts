import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as ctrl from '../controllers/leave.controller';

const router = Router();

router.use(requireAuth);

// POST /api/leave/:id/approve
router.post(
  '/:id/approve',
  requireRole('department_head', 'admin'),
  validate(z.object({ reviewNote: z.string().optional().default('') })),
  ctrl.approveLeave,
);

// POST /api/leave/:id/reject
router.post(
  '/:id/reject',
  requireRole('department_head', 'admin'),
  validate(z.object({ reason: z.string().min(5) })),
  ctrl.rejectLeave,
);

export default router;
