'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import Link from 'next/link';

interface Hold {
  id: string;
  student_id: string;
  student_name: string;
  hold_type: string;
  reason: string;
  placed_at: string;
  is_active: boolean;
  lifted_at: string | null;
}

interface AssignedStudent {
  id: string;
  name: string;
}

const HOLD_TYPES = ['registration', 'financial', 'academic', 'disciplinary', 'administrative'] as const;

export default function HoldManagementPage() {
  const supabase = createClient();
  const [advisorId, setAdvisorId] = useState('');
  const [holds, setHolds] = useState<Hold[]>([]);
  const [students, setStudents] = useState<AssignedStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'lifted'>('all');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ student_id: '', hold_type: 'registration', reason: '' });
  const [saving, setSaving] = useState(false);
  const [liftingId, setLiftingId] = useState<string | null>(null);
  const [confirmLift, setConfirmLift] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: me } = await supabase.from('users').select('id').eq('auth_user_id', user.id).single();
      if (!me) return;
      const aid = (me as { id: string }).id;
      setAdvisorId(aid);

      const { data: assignments } = await supabase
        .from('advisor_assignments')
        .select('student_id, users!fk_aa_student(id, first_name, last_name)')
        .eq('advisor_id', aid)
        .eq('is_active', true);

      setStudents(
        ((assignments ?? []) as any[]).map(a => ({
          id: a.student_id,
          name: a.users ? `${a.users.first_name} ${a.users.last_name}` : '—',
        }))
      );
    };
    init();
  }, []);

  const loadHolds = useCallback(async () => {
    if (!advisorId) return;
    setLoading(true);
    const { data } = await supabase
      .from('student_holds')
      .select('id, student_id, hold_type, reason, placed_at, is_active, lifted_at, users!student_id(first_name, last_name)')
      .eq('placed_by', advisorId)
      .order('placed_at', { ascending: false });

    setHolds(
      ((data ?? []) as any[]).map(r => ({
        id: r.id,
        student_id: r.student_id,
        student_name: r.users ? `${r.users.first_name} ${r.users.last_name}` : '—',
        hold_type: r.hold_type,
        reason: r.reason,
        placed_at: r.placed_at,
        is_active: r.is_active,
        lifted_at: r.lifted_at,
      }))
    );
    setLoading(false);
  }, [advisorId]);

  useEffect(() => { if (advisorId) loadHolds(); }, [advisorId, loadHolds]);

  const placeHold = async () => {
    if (!form.student_id || !form.reason.trim()) {
      toast.error('Student and reason are required');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('student_holds').insert({
      student_id: form.student_id,
      placed_by: advisorId,
      hold_type: form.hold_type,
      reason: form.reason.trim(),
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success('Hold placed successfully');
    setShowModal(false);
    setForm({ student_id: '', hold_type: 'registration', reason: '' });
    setSaving(false);
    loadHolds();
  };

  const liftHold = async (id: string) => {
    setLiftingId(id);
    const { error } = await supabase.from('student_holds').update({
      is_active: false,
      lifted_at: new Date().toISOString(),
      lifted_by: advisorId,
    }).eq('id', id);
    if (error) { toast.error(error.message); } else { toast.success('Hold lifted'); loadHolds(); }
    setLiftingId(null);
    setConfirmLift(null);
  };

  const holdTypeBadge = (t: string) => {
    const map: Record<string, string> = {
      registration: 'bg-orange-100 text-orange-700',
      financial: 'bg-yellow-100 text-yellow-700',
      academic: 'bg-blue-100 text-blue-700',
      disciplinary: 'bg-red-100 text-red-700',
      administrative: 'bg-purple-100 text-purple-700',
    };
    return map[t] ?? 'bg-gray-100 text-gray-600';
  };

  const activeCount = holds.filter(h => h.is_active).length;
  const liftedCount = holds.filter(h => !h.is_active).length;
  const typeCounts = HOLD_TYPES.reduce((acc, t) => ({ ...acc, [t]: holds.filter(h => h.hold_type === t && h.is_active).length }), {} as Record<string, number>);

  const filtered = holds.filter(h => {
    if (filterActive === 'active' && !h.is_active) return false;
    if (filterActive === 'lifted' && h.is_active) return false;
    if (filterType && h.hold_type !== filterType) return false;
    return true;
  });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hold Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Place and manage registration holds for your students</p>
        </div>
        <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors">
          + Place Hold
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <button onClick={() => setFilterActive(filterActive === 'all' ? 'all' : 'all')}
          className={`bg-white rounded-xl border p-4 text-left hover:shadow-sm transition ${filterActive === 'all' && !filterType ? 'border-teal-500 ring-1 ring-teal-500' : 'border-gray-200'}`}>
          <div className="text-2xl font-bold text-gray-800">{holds.length}</div>
          <div className="text-xs text-gray-500 mt-0.5">Total Holds</div>
        </button>
        <button onClick={() => setFilterActive(filterActive === 'active' ? 'all' : 'active')}
          className={`bg-white rounded-xl border p-4 text-left hover:shadow-sm transition ${filterActive === 'active' ? 'border-teal-500 ring-1 ring-teal-500' : 'border-gray-200'}`}>
          <div className="text-2xl font-bold text-red-600">{activeCount}</div>
          <div className="text-xs text-gray-500 mt-0.5">Active</div>
        </button>
        <button onClick={() => setFilterActive(filterActive === 'lifted' ? 'all' : 'lifted')}
          className={`bg-white rounded-xl border p-4 text-left hover:shadow-sm transition ${filterActive === 'lifted' ? 'border-teal-500 ring-1 ring-teal-500' : 'border-gray-200'}`}>
          <div className="text-2xl font-bold text-green-600">{liftedCount}</div>
          <div className="text-xs text-gray-500 mt-0.5">Lifted</div>
        </button>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-left">
          <div className="text-2xl font-bold text-teal-600">{students.length}</div>
          <div className="text-xs text-gray-500 mt-0.5">Assigned Students</div>
        </div>
      </div>

      {/* Hold type filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={() => setFilterType('')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${!filterType ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          All Types
        </button>
        {HOLD_TYPES.map(t => (
          <button key={t} onClick={() => setFilterType(filterType === t ? '' : t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${filterType === t ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {t} {typeCounts[t] > 0 && <span className="ml-1 text-[10px]">({typeCounts[t]})</span>}
          </button>
        ))}
      </div>

      {/* Holds list */}
      {loading ? (
        <div className="text-center py-16 text-gray-500">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-200">
          {holds.length === 0 ? 'No holds placed yet' : 'No holds match your filters'}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(h => (
            <div key={h.id} className={`bg-white rounded-xl border p-5 transition-all ${h.is_active ? 'border-red-200 hover:shadow-sm' : 'border-gray-200 opacity-75'}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${holdTypeBadge(h.hold_type)}`}>
                      {h.hold_type.charAt(0).toUpperCase() + h.hold_type.slice(1)}
                    </span>
                    {h.is_active ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">Active</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">Lifted</span>
                    )}
                    <span className="text-xs text-gray-400">·</span>
                    <Link href={`/advisor/students/${h.student_id}`} className="font-semibold text-gray-900 hover:text-teal-700 text-sm">
                      {h.student_name}
                    </Link>
                  </div>
                  <p className="text-sm text-gray-700">{h.reason}</p>
                  <p className="text-xs text-gray-400 mt-1.5">
                    Placed {new Date(h.placed_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                    {h.lifted_at && ` · Lifted ${new Date(h.lifted_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}`}
                  </p>
                </div>
                {h.is_active && (
                  <button onClick={() => setConfirmLift(h.id)} disabled={liftingId === h.id}
                    className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 disabled:opacity-50 shrink-0 ml-4 transition-colors">
                    {liftingId === h.id ? 'Lifting…' : 'Lift Hold'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Place hold modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-4">Place Hold</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Student <span className="text-red-500">*</span></label>
                <select value={form.student_id} onChange={e => setForm(f => ({ ...f, student_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">Select student…</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hold Type</label>
                <select value={form.hold_type} onChange={e => setForm(f => ({ ...f, hold_type: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  {HOLD_TYPES.map(t => (
                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason <span className="text-red-500">*</span></label>
                <textarea rows={3} placeholder="Describe the reason for this hold…" value={form.reason}
                  onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowModal(false)} disabled={saving} className="px-4 py-2 rounded-lg border text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
              <button onClick={placeHold} disabled={saving} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60">
                {saving ? 'Placing…' : 'Place Hold'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lift hold confirmation modal */}
      {confirmLift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold mb-2">Lift Hold?</h2>
            <p className="text-sm text-gray-600 mb-4">
              This will remove the hold and allow the student to proceed with registration. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmLift(null)} className="px-4 py-2 rounded-lg border text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={() => liftHold(confirmLift)} disabled={liftingId === confirmLift}
                className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-60">
                {liftingId === confirmLift ? 'Lifting…' : 'Confirm Lift'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
