import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as ctrl from '../controllers/registration.controller';

const router = Router();

router.use(requireAuth);

// GET /api/registration/prerequisites?studentId=&offeringId=
router.get(
  '/prerequisites',
  requireRole('registrar', 'admin'),
  ctrl.checkPrerequisites,
);

// POST /api/registration/:id/approve
router.post(
  '/:id/approve',
  requireRole('registrar', 'admin'),
  validate(
    z.object({
      studentId: z.string().uuid(),
      offeringId: z.string().uuid(),
      isOverride: z.boolean().default(false),
      overrideReason: z.string().optional().default(''),
      courseCode: z.string().optional(),
    }),
  ),
  ctrl.approveRequest,
);

// POST /api/registration/:id/reject
router.post(
  '/:id/reject',
  requireRole('registrar', 'admin'),
  validate(
    z.object({
      studentId: z.string().uuid(),
      reason: z.string().min(3),
      courseCode: z.string().optional(),
    }),
  ),
  ctrl.rejectRequest,
);

// POST /api/registration/:id/approve-drop
router.post(
  '/:id/approve-drop',
  requireRole('registrar', 'admin'),
  validate(
    z.object({
      studentId: z.string().uuid(),
      offeringId: z.string().uuid(),
      type: z.enum(['add', 'drop']),
    }),
  ),
  ctrl.approveAddDrop,
);

export default router;
