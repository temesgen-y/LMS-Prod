import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as ctrl from '../controllers/departments.controller';

const router = Router();

router.use(requireAuth);

// POST /api/departments/assign-head
router.post(
  '/assign-head',
  requireRole('admin'),
  validate(
    z.object({
      instructorId: z.string().uuid(),
      departmentId: z.string().uuid(),
    }),
  ),
  ctrl.assignDeptHead,
);

// POST /api/departments/remove-head
router.post(
  '/remove-head',
  requireRole('admin'),
  validate(z.object({ departmentId: z.string().uuid() })),
  ctrl.removeDeptHead,
);

export default router;
