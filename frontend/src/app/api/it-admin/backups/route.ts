import { NextRequest, NextResponse } from 'next/server';
import { requireItAdmin, writeAuditLog } from '@/lib/auth/require-it-admin';

/**
 * GET /api/it-admin/backups
 * Lists backup/restore records, newest first.
 */
export async function GET() {
  const auth = await requireItAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { admin } = auth.ctx;

  const { data, error } = await admin
    .from('system_backups')
    .select('id, name, backup_type, status, size_bytes, location, restore_status, initiated_by, notes, error_message, started_at, completed_at, created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich initiator names
  const rows = (data ?? []) as { initiated_by: string | null }[];
  const ids = [...new Set(rows.map(r => r.initiated_by).filter(Boolean))] as string[];
  const nameMap: Record<string, string> = {};
  if (ids.length) {
    const { data: users } = await admin.from('users').select('id, first_name, last_name').in('id', ids);
    ((users ?? []) as { id: string; first_name: string; last_name: string }[]).forEach(u => {
      nameMap[u.id] = `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim();
    });
  }

  return NextResponse.json({
    backups: (data ?? []).map(b => ({
      ...(b as Record<string, unknown>),
      initiatedByName: (b as { initiated_by: string | null }).initiated_by
        ? (nameMap[(b as { initiated_by: string }).initiated_by] ?? 'Unknown')
        : 'Scheduled',
    })),
  });
}

/**
 * POST /api/it-admin/backups
 * Records a manual backup-monitoring entry.
 * Body: { name, backup_type?, status?, size_bytes?, location?, notes? }
 */
export async function POST(request: NextRequest) {
  const auth = await requireItAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { actorId, admin } = auth.ctx;

  const body = await request.json().catch(() => ({}));
  const { name, backup_type, status, size_bytes, location, notes } = body as {
    name?: string;
    backup_type?: string;
    status?: string;
    size_bytes?: number;
    location?: string;
    notes?: string;
  };

  if (!name?.trim()) {
    return NextResponse.json({ error: 'A backup name is required.' }, { status: 400 });
  }
  const type = ['full', 'database', 'files'].includes(backup_type ?? '') ? backup_type : 'full';
  const st = ['completed', 'failed', 'in_progress'].includes(status ?? '') ? status : 'completed';

  const { data, error } = await admin
    .from('system_backups')
    .insert({
      name: name.trim(),
      backup_type: type,
      status: st,
      size_bytes: typeof size_bytes === 'number' ? size_bytes : null,
      location: location?.trim() || null,
      notes: notes?.trim() || null,
      initiated_by: actorId,
      completed_at: st === 'in_progress' ? null : new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(admin, {
    actorId, action: 'backup.record', targetType: 'system_backup',
    targetId: (data as { id: string })?.id ?? null, details: { name: name.trim(), type, status: st }, request,
  });

  return NextResponse.json({ success: true, id: (data as { id: string })?.id });
}
