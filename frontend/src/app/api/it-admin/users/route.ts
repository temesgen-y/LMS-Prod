import { NextRequest, NextResponse } from 'next/server';
import { requireItAdmin } from '@/lib/auth/require-it-admin';

/**
 * GET /api/it-admin/users
 * Lists user accounts for IT admin management.
 * Query params: search, role, status, page (0-based), pageSize.
 */
export async function GET(request: NextRequest) {
  const auth = await requireItAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { admin } = auth.ctx;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search')?.trim() ?? '';
  const roleFilter = searchParams.get('role')?.trim() ?? '';
  const statusFilter = searchParams.get('status')?.trim() ?? '';
  const page = Math.max(0, parseInt(searchParams.get('page') ?? '0', 10) || 0);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '25', 10) || 25));

  let query = admin
    .from('users')
    .select('id, first_name, last_name, email, role, status, created_at, avatar_url', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1);

  if (roleFilter) query = query.eq('role', roleFilter);
  if (statusFilter) query = query.eq('status', statusFilter);
  if (search) {
    query = query.or(
      `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`
    );
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ users: data ?? [], total: count ?? 0, page, pageSize });
}
