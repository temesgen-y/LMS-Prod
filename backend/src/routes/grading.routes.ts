import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as ctrl from '../controllers/grading.controller';

const router = Router();

router.use(requireAuth);

// POST /api/grading/gradebook-item
router.post(
  '/gradebook-item',
  requireRole('instructor', 'admin', 'department_head'),
  validate(
    z.object({
      enrollmentId: z.string().uuid(),
      itemId: z.string().uuid(),
      itemType: z.enum(['assessment', 'assignment']),
      rawScore: z.number().min(0),
      totalMarks: z.number().positive(),
      isOverride: z.boolean().optional().default(false),
      overrideNote: z.string().optional().default(''),
    }),
  ),
  ctrl.upsertGradebookItem,
);

// POST /api/grading/recalculate/:enrollmentId
router.post(
  '/recalculate/:enrollmentId',
  requireRole('instructor', 'admin', 'department_head'),
  ctrl.recalculateFinalGrade,
);

export default router;
