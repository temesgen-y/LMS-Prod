/**
 * rbac.ts — Role-Based Access Control
 *
 * Defines a permission matrix and provides helpers used by every API route
 * to enforce authorization uniformly instead of ad-hoc inline checks.
 *
 * Usage in a Route Handler:
 *   const { user, appUser, role } = await requireRole(request, ['ADMIN', 'REGISTRAR']);
 *   // throws → returns 401/403 JSON response if not authorized
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUserRoleNames } from '@/lib/auth/get-user-roles';
import { getHighestRole, type RoleName } from '@/types/auth';

// ─── Permission matrix ────────────────────────────────────────────────────────
// Maps resource:action → set of roles that may perform it.
// Add entries here as new API surfaces are created.

type Resource =
  | 'users'
  | 'instructors'
  | 'students'
  | 'courses'
  | 'enrollments'
  | 'assessments'
  | 'exam_sessions'
  | 'grades'
  | 'announcements'
  | 'live_sessions'
  | 'scorm'
  | 'audit_logs'
  | 'backups'
  | 'system_settings'
  | 'payments'
  | 'certificates'
  | 'reports';

type Action = 'read' | 'create' | 'update' | 'delete' | 'manage' | 'monitor' | 'export';

type PermissionKey = `${Resource}:${Action}`;

const PERMISSIONS: Partial<Record<PermissionKey, RoleName[]>> = {
  // Users
  'users:read':    ['ADMIN', 'REGISTRAR', 'IT_ADMIN'],
  'users:create':  ['ADMIN'],
  'users:update':  ['ADMIN', 'IT_ADMIN'],
  'users:delete':  ['ADMIN'],
  'users:manage':  ['ADMIN'],

  // Instructors
  'instructors:create':  ['ADMIN'],
  'instructors:update':  ['ADMIN', 'DEPARTMENT_HEAD'],
  'instructors:delete':  ['ADMIN'],
  'instructors:read':    ['ADMIN', 'REGISTRAR', 'DEPARTMENT_HEAD'],

  // Students
  'students:read':    ['ADMIN', 'REGISTRAR', 'ACADEMIC_ADVISOR', 'INSTRUCTOR', 'DEPARTMENT_HEAD'],
  'students:create':  ['ADMIN', 'REGISTRAR'],
  'students:update':  ['ADMIN', 'REGISTRAR'],
  'students:delete':  ['ADMIN'],
  'students:manage':  ['ADMIN', 'REGISTRAR'],

  // Courses
  'courses:read':    ['ADMIN', 'REGISTRAR', 'INSTRUCTOR', 'STUDENT', 'ACADEMIC_ADVISOR', 'DEPARTMENT_HEAD'],
  'courses:create':  ['ADMIN', 'REGISTRAR', 'DEPARTMENT_HEAD'],
  'courses:update':  ['ADMIN', 'REGISTRAR', 'DEPARTMENT_HEAD'],
  'courses:delete':  ['ADMIN'],
  'courses:manage':  ['ADMIN', 'REGISTRAR'],

  // Enrollments
  'enrollments:read':    ['ADMIN', 'REGISTRAR', 'INSTRUCTOR', 'ACADEMIC_ADVISOR'],
  'enrollments:create':  ['ADMIN', 'REGISTRAR', 'STUDENT'],
  'enrollments:update':  ['ADMIN', 'REGISTRAR'],
  'enrollments:delete':  ['ADMIN', 'REGISTRAR'],

  // Assessments
  'assessments:read':    ['ADMIN', 'INSTRUCTOR', 'STUDENT', 'DEPARTMENT_HEAD'],
  'assessments:create':  ['ADMIN', 'INSTRUCTOR'],
  'assessments:update':  ['ADMIN', 'INSTRUCTOR'],
  'assessments:delete':  ['ADMIN', 'INSTRUCTOR'],
  'assessments:monitor': ['ADMIN', 'INSTRUCTOR', 'DEPARTMENT_HEAD'],

  // Exam sessions
  'exam_sessions:read':    ['ADMIN', 'INSTRUCTOR', 'DEPARTMENT_HEAD'],
  'exam_sessions:monitor': ['ADMIN', 'INSTRUCTOR', 'DEPARTMENT_HEAD'],
  'exam_sessions:update':  ['ADMIN', 'INSTRUCTOR'],
  'exam_sessions:delete':  ['ADMIN'],

  // Grades
  'grades:read':    ['ADMIN', 'INSTRUCTOR', 'STUDENT', 'ACADEMIC_ADVISOR', 'REGISTRAR'],
  'grades:create':  ['ADMIN', 'INSTRUCTOR'],
  'grades:update':  ['ADMIN', 'INSTRUCTOR'],
  'grades:delete':  ['ADMIN'],
  'grades:export':  ['ADMIN', 'REGISTRAR', 'INSTRUCTOR'],

  // Announcements
  'announcements:read':    ['ADMIN', 'INSTRUCTOR', 'STUDENT', 'REGISTRAR', 'DEPARTMENT_HEAD', 'ACADEMIC_ADVISOR'],
  'announcements:create':  ['ADMIN', 'INSTRUCTOR', 'REGISTRAR'],
  'announcements:update':  ['ADMIN', 'INSTRUCTOR', 'REGISTRAR'],
  'announcements:delete':  ['ADMIN', 'INSTRUCTOR'],

  // Live sessions
  'live_sessions:read':    ['ADMIN', 'INSTRUCTOR', 'STUDENT'],
  'live_sessions:create':  ['ADMIN', 'INSTRUCTOR'],
  'live_sessions:update':  ['ADMIN', 'INSTRUCTOR'],
  'live_sessions:delete':  ['ADMIN', 'INSTRUCTOR'],

  // SCORM
  'scorm:read':    ['ADMIN', 'INSTRUCTOR', 'STUDENT'],
  'scorm:create':  ['ADMIN', 'INSTRUCTOR'],
  'scorm:update':  ['ADMIN', 'INSTRUCTOR'],
  'scorm:delete':  ['ADMIN'],
  'scorm:monitor': ['ADMIN', 'INSTRUCTOR'],

  // Audit logs
  'audit_logs:read':   ['ADMIN', 'IT_ADMIN'],
  'audit_logs:export': ['ADMIN'],

  // Backups
  'backups:read':    ['ADMIN', 'IT_ADMIN'],
  'backups:create':  ['ADMIN', 'IT_ADMIN'],
  'backups:delete':  ['ADMIN'],
  'backups:manage':  ['ADMIN', 'IT_ADMIN'],

  // System settings
  'system_settings:read':   ['ADMIN', 'IT_ADMIN'],
  'system_settings:update': ['ADMIN'],

  // Payments
  'payments:read':   ['ADMIN', 'REGISTRAR', 'STUDENT'],
  'payments:create': ['STUDENT'],
  'payments:update': ['ADMIN', 'REGISTRAR'],
  'payments:manage': ['ADMIN', 'REGISTRAR'],

  // Certificates
  'certificates:read':   ['ADMIN', 'INSTRUCTOR', 'STUDENT', 'REGISTRAR'],
  'certificates:create': ['ADMIN', 'INSTRUCTOR'],
  'certificates:delete': ['ADMIN'],

  // Reports
  'reports:read':   ['ADMIN', 'REGISTRAR', 'DEPARTMENT_HEAD', 'ACADEMIC_ADVISOR', 'IT_ADMIN'],
  'reports:export': ['ADMIN', 'REGISTRAR'],
};

/** Check whether a role has permission for a resource:action pair. */
export function hasPermission(role: RoleName, resource: Resource, action: Action): boolean {
  const key = `${resource}:${action}` as PermissionKey;
  return PERMISSIONS[key]?.includes(role) ?? false;
}

// ─── API route guard ──────────────────────────────────────────────────────────

export interface AuthContext {
  authUserId: string;
  appUserId:  string;
  role:       RoleName;
}

type GuardResult =
  | { ok: true;  ctx: AuthContext }
  | { ok: false; response: NextResponse };

/**
 * Verify authentication and check that the caller has one of `allowedRoles`.
 * Accepts both Bearer token (Authorization header) and cookie-based sessions.
 *
 * Returns either `{ ok: true, ctx }` or `{ ok: false, response }`.
 * The caller MUST return `result.response` if `ok` is false.
 *
 * Example:
 *   const guard = await guardRoute(request, ['ADMIN']);
 *   if (!guard.ok) return guard.response;
 *   const { ctx } = guard;
 */
export async function guardRoute(
  request: NextRequest,
  allowedRoles: RoleName[]
): Promise<GuardResult> {
  const admin = createAdminClient();

  let authUserId: string | null = null;

  // 1. Try Bearer token first
  const authHeader = request.headers.get('Authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (bearerToken) {
    const { data, error } = await admin.auth.getUser(bearerToken);
    if (error || !data.user) {
      return { ok: false, response: NextResponse.json({ error: 'Invalid or expired token.' }, { status: 401 }) };
    }
    authUserId = data.user.id;
  } else {
    // 2. Cookie-based session
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return { ok: false, response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) };
    }
    authUserId = data.user.id;
  }

  // 3. Load role
  const roleNames = await getUserRoleNames(admin, authUserId);
  const role = getHighestRole(roleNames as RoleName[]);
  if (!role || !allowedRoles.includes(role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Access denied. Required role: ${allowedRoles.join(' or ')}.` },
        { status: 403 }
      ),
    };
  }

  // 4. Load app user ID
  const { data: appUser } = await admin
    .from('users').select('id').eq('auth_user_id', authUserId).single();
  const appUserId = (appUser as { id: string } | null)?.id ?? authUserId;

  return { ok: true, ctx: { authUserId, appUserId, role } };
}
