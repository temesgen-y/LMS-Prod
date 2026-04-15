import { Router } from 'express';
import registrationRoutes from './registration.routes';
import leaveRoutes from './leave.routes';
import feesRoutes from './fees.routes';
import standingRoutes from './standing.routes';
import staffRoutes from './staff.routes';
import gradingRoutes from './grading.routes';
import departmentsRoutes from './departments.routes';

export const router = Router();

router.use('/registration', registrationRoutes);
router.use('/leave', leaveRoutes);
router.use('/fees', feesRoutes);
router.use('/standing', standingRoutes);
router.use('/staff', staffRoutes);
router.use('/grading', gradingRoutes);
router.use('/departments', departmentsRoutes);
