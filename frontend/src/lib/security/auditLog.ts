/**
 * auditLog.ts — Server-side audit logging
 *
 * Writes immutable records to the `audit_logs` table for every sensitive
 * action in the system. Used by API Route Handlers (server-only).
 *
 * The schema's `audit_logs` table has at minimum:
 *   id, actor_id, action, target_type, target_id, details (jsonb),
 *   ip_address, user_agent, created_at
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest } from 'next/server';

export type AuditAction =
  // Auth
  | 'login'
  | 'logout'
  | 'login_failed'
  | 'password_changed'
  | 'password_reset_requested'
  | 'session_terminated'
  // Users
  | 'user_created'
  | 'user_updated'
  | 'user_deleted'
  | 'user_suspended'
  | 'user_activated'
  | 'role_changed'
  // Instructors
  | 'instructor_invited'
  | 'instructor_deleted'
  | 'instructor_department_assigned'
  // Students
  | 'student_approved'
  | 'student_rejected'
  | 'student_enrolled'
  | 'student_unenrolled'
  // Courses
  | 'course_created'
  | 'course_updated'
  | 'course_deleted'
  // Assessments / Exams
  | 'assessment_created'
  | 'assessment_updated'
  | 'assessment_deleted'
  | 'exam_started'
  | 'exam_submitted'
  | 'exam_terminated'
  | 'exam_violation_flagged'
  // Grades
  | 'grade_posted'
  | 'grade_updated'
  // Payments
  | 'payment_initiated'
  | 'payment_completed'
  | 'payment_failed'
  // Data export
  | 'data_exported'
  | 'report_generated'
  // System
  | 'system_settings_updated'
  | 'backup_created'
  | 'backup_deleted'
  // Access control
  | 'unauthorized_access_attempt'
  | 'permission_denied';

export interface AuditLogParams {
  actorId:    string | null;     // app user ID performing the action (null = system/unauthenticated)
  action:     AuditAction;
  targetType?: string;           // e.g. 'user', 'assessment', 'course'
  targetId?:   string;           // the affected record's ID
  details?:    Record<string, unknown>;
  ipAddress?:  string;
  userAgent?:  string;
}

export async function writeAuditLog(params: AuditLogParams): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from('audit_logs').insert({
      actor_id:    params.actorId,
      action:      params.action,
      // Legacy columns kept nullable; new alias columns carry semantic meaning
      table_name:  params.targetType ?? null,
      record_id:   null,                       // uuid col — keep null; use target_id (text)
      target_type: params.targetType ?? null,
      target_id:   params.targetId ?? null,
      details:     params.details ?? null,
      ip_address:  params.ipAddress ?? null,
      user_agent:  params.userAgent ?? null,
    });
  } catch {
    // Audit logging must never crash the calling route
  }
}

/** Extract IP + User-Agent from a Next.js request for audit records. */
export function requestMeta(req: NextRequest): { ipAddress: string; userAgent: string } {
  return {
    ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
              ?? req.headers.get('x-real-ip')
              ?? '127.0.0.1',
    userAgent: req.headers.get('user-agent') ?? '',
  };
}
