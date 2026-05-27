import { NextRequest, NextResponse } from 'next/server';
import { generateCsrfToken } from '@/lib/security/csrf';

// GET /api/csrf-token
// Returns a fresh CSRF token and sets it as a cookie.
export async function GET(request: NextRequest) {
  const existing = request.cookies.get('__csrf')?.value;
  const token = existing ?? generateCsrfToken();

  const response = NextResponse.json({ token });
  if (!existing) {
    response.cookies.set('__csrf', token, {
      httpOnly: false,
      sameSite: 'strict',
      secure:   process.env.NODE_ENV === 'production',
      path:     '/',
      maxAge:   60 * 60 * 8,
    });
  }
  return response;
}
