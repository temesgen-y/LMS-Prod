import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as gpa from '../services/gpa.service';

export const getTranscript = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { studentId } = req.params as Record<string, string>;
    // Students may only access their own transcript
    if (req.user!.role === 'student' && req.user!.id !== studentId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    const transcript = await gpa.calculateTranscript(studentId);
    res.json({ data: transcript });
  } catch (err) { next(err); }
};

export const getGPASummary = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { studentId } = req.params as Record<string, string>;
    if (req.user!.role === 'student' && req.user!.id !== studentId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    const records = await gpa.getStudentGPARecords(studentId);
    res.json({ data: records });
  } catch (err) { next(err); }
};

export const recalculateGPA = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { studentId } = req.params as Record<string, string>;
    await gpa.recalculateStudentGPA(studentId);
    res.json({ success: true });
  } catch (err) { next(err); }
};

export const recalculateOfferingGPAs = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { offeringId } = req.params as Record<string, string>;
    const count = await gpa.recalculateOfferingGPAs(offeringId);
    res.json({ success: true, studentsProcessed: count });
  } catch (err) { next(err); }
};

export const getGradeScale = async (_req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const scale = await gpa.getGradeScaleFromDb();
    res.json({ data: scale });
  } catch (err) { next(err); }
};

export const getProgramProgress = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { studentId } = req.params as Record<string, string>;
    if (req.user!.role === 'student' && req.user!.id !== studentId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    const progress = await gpa.getProgramProgress(studentId);
    res.json({ data: progress });
  } catch (err) { next(err); }
};

export const updateProgramProgress = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { studentId, programId } = req.params as Record<string, string>;
    await gpa.updateProgramProgress(studentId, programId);
    res.json({ success: true });
  } catch (err) { next(err); }
};
