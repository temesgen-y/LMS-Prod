import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as ctrl from '../controllers/staff.controller';

const router = Router();

router.use(requireAuth);

// POST /api/staff/create
router.post(
  '/create',
  requireRole('admin'),
  validate(
    z.object({
      email: z.string().email(),
      password: z.string().min(8),
      first_name: z.string().min(1),
      last_name: z.string().min(1),
      role: z.enum(['registrar', 'department_head', 'academic_advisor', 'it_admin']),
      staff_no: z.string().optional(),
      department: z.string().optional(),
      specialization: z.string().optional(),
      access_level: z.string().optional(),
    }),
  ),
  ctrl.createStaff,
);

export default router;
