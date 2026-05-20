import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as ctrl from '../controllers/grading.controller';
import * as gpaCtrl from '../controllers/gpa.controller';

const router = Router();

router.use(requireAuth);

// ── Existing gradebook routes ─────────────────────────────────────────────────

router.post(
  '/gradebook-item',
  requireRole('instructor', 'admin', 'department_head'),
  validate(
    z.object({
      enrollmentId: z.string().uuid(),
      itemId:       z.string().uuid(),
      itemType:     z.enum(['assessment', 'assignment']),
      rawScore:     z.number().min(0),
      totalMarks:   z.number().positive(),
      isOverride:   z.boolean().optional().default(false),
      overrideNote: z.string().optional().default(''),
    }),
  ),
  ctrl.upsertGradebookItem,
);

router.post(
  '/recalculate/:enrollmentId',
  requireRole('instructor', 'admin', 'department_head'),
  ctrl.recalculateFinalGrade,
);

// ── GPA & Transcript routes ───────────────────────────────────────────────────

// Grade scale reference (all authenticated roles)
router.get('/grade-scale', gpaCtrl.getGradeScale);

// Full transcript data for a student
router.get(
  '/transcript/:studentId',
  requireRole('student', 'admin', 'registrar', 'academic_advisor', 'department_head', 'instructor'),
  gpaCtrl.getTranscript,
);

// Semester-by-semester GPA records
router.get(
  '/gpa/:studentId',
  requireRole('student', 'admin', 'registrar', 'academic_advisor', 'department_head'),
  gpaCtrl.getGPASummary,
);

// Trigger GPA recalculation for one student
router.post(
  '/recalculate-gpa/:studentId',
  requireRole('admin', 'registrar', 'instructor', 'department_head'),
  gpaCtrl.recalculateGPA,
);

// Trigger GPA recalculation for all students in an offering (after grade publish)
router.post(
  '/recalculate-gpa-offering/:offeringId',
  requireRole('instructor', 'admin', 'department_head'),
  gpaCtrl.recalculateOfferingGPAs,
);

// Program progress
router.get(
  '/program-progress/:studentId',
  requireRole('student', 'admin', 'registrar', 'academic_advisor', 'department_head'),
  gpaCtrl.getProgramProgress,
);

router.post(
  '/program-progress/:studentId/:programId',
  requireRole('admin', 'registrar'),
  gpaCtrl.updateProgramProgress,
);

export default router;
