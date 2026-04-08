export const ROLE_PRIORITY = ['ADMIN', 'DEPARTMENT_HEAD', 'INSTRUCTOR', 'STUDENT', 'REGISTRAR', 'ACADEMIC_ADVISOR', 'IT_ADMIN'] as const;
export type RoleName = (typeof ROLE_PRIORITY)[number];

export interface AppUser {
  id: string;
  email: string;
  fullName: string;
  role: RoleName;
  authUserId: string;
}

export function getHighestRole(roles: RoleName[]): RoleName | null {
  for (const r of ROLE_PRIORITY) {
    if (roles.includes(r)) return r;
  }
  return null;
}

export function getRedirectForRole(role: RoleName): string {
  switch (role) {
    case 'ADMIN': return '/admin/dashboard';
    case 'INSTRUCTOR': return '/instructor/dashboard';
    case 'STUDENT': return '/dashboard';
    case 'REGISTRAR': return '/registrar/dashboard';
    case 'ACADEMIC_ADVISOR': return '/advisor/dashboard';
    case 'DEPARTMENT_HEAD': return '/dept-head/home';
    case 'IT_ADMIN': return '/it-admin/dashboard';
    default: return '/unauthorized';
  }
}
