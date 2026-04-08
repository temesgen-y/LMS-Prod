'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface Standing {
  id: string;
  student_id: string;
  student_name: string;
  term_name: string;
  term_id: string;
  gpa: number;
  cumulative_gpa: number;
  standing: string;
  credits_earned: number;
  credits_attempted: number;
  notes: string | null;
}

interface Term { id: string; term_name: string; }

function standingBadge(standing: string) {
  const map: Record<string, string> = {
    good: 'bg-green-100 text-green-800',
    warning: 'bg-yellow-100 text-yellow-800',
    probation: 'bg-orange-100 text-orange-800',
    suspension: 'bg-red-100 text-red-800',
    dismissed: 'bg-red-900 text-white',
    honors: 'bg-blue-100 text-blue-800',
  };
  return map[standing] ?? 'bg-gray-100 text-gray-600';
}

export default function AcademicStandingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const [standings, setStandings] = useState<Standing[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [students, setStudents] = useState<{ id: string; name: string }[]>([]);
  const [formData, setFormData] = useState({
    student_id: '',
    term_id: '',
    gpa: '',
    cumulative_gpa: '',
    standing: 'good',
    credits_earned: '',
    credits_attempted: '',
    notes: '',
  });
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { router.replace('/login'); return; }
      const { data: currentUser } = await supabase.from('users').select('id').eq('auth_user_id', authUser.id).single();
      if (!currentUser) return;
      setCurrentUserId((currentUser as any).id);

      const [standRes, termRes, studentRes] = await Promise.all([
        supabase.from('academic_standing')
          .select('id, student_id, gpa, cumulative_gpa, standing, credits_earned, credits_attempted, notes, users!student_id(first_name, last_name), academic_terms!term_id(id, term_name)')
          .order('created_at', { ascending: false }),
        supabase.from('academic_terms').select('id, term_name').order('start_date', { ascending: false }),
        supabase.from('users').select('id, first_name, last_name').eq('role', 'student').order('last_name'),
      ]);

      setStandings(((standRes.data ?? []) as any[]).map(s => ({
        id: s.id,
        student_id: s.student_id,
        student_name: s.users ? `${s.users.first_name || ''} ${s.users.last_name || ''}`.trim() : 'Unknown',
        term_name: s.academic_terms?.term_name ?? '—',
        term_id: s.academic_terms?.id ?? '',
        gpa: s.gpa,
        cumulative_gpa: s.cumulative_gpa,
        standing: s.standing,
        credits_earned: s.credits_earned,
        credits_attempted: s.credits_attempted,
        notes: s.notes,
      })));

      setTerms((termRes.data ?? []) as Term[]);
      setStudents(((studentRes.data ?? []) as any[]).map(u => ({
        id: u.id,
        name: `${u.first_name || ''} ${u.last_name || ''}`.trim(),
      })));
    } catch (e: any) {
      setError(e.message ?? 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAddStanding = async () => {
    if (!formData.student_id || !formData.term_id || !formData.gpa || !formData.cumulative_gpa || !formData.credits_earned || !formData.credits_attempted) {
      setFormError('Please fill in all required fields.');
      return;
    }
    setFormLoading(true);
    setFormError('');
    try {
      const supabase = createClient();
      const { error: insertErr } = await supabase.from('academic_standing').upsert({
        student_id: formData.student_id,
        term_id: formData.term_id,
        gpa: parseFloat(formData.gpa),
        cumulative_gpa: parseFloat(formData.cumulative_gpa),
        standing: formData.standing,
        credits_earned: parseInt(formData.credits_earned),
        credits_attempted: parseInt(formData.credits_attempted),
        notes: formData.notes || null,
        recorded_by: currentUserId,
      }, { onConflict: 'student_id,term_id' });
      if (insertErr) throw new Error(insertErr.message);
      setShowModal(false);
      setFormData({ student_id: '', term_id: '', gpa: '', cumulative_gpa: '', standing: 'good', credits_earned: '', credits_attempted: '', notes: '' });
      loadData();
    } catch (e: any) {
      setFormError(e.message ?? 'Failed to save');
    } finally {
      setFormLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-700" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Academic Standing</h1>
        <button
          type="button"
          onClick={() => { setShowModal(true); setFormError(''); }}
          className="px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-sm font-medium"
        >
          + Add Standing
        </button>
      </div>
      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">{error}</div>}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {standings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <p className="text-sm">No academic standing records</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">Student</th>
                  <th className="px-5 py-3 text-left font-medium">Term</th>
                  <th className="px-5 py-3 text-left font-medium">GPA</th>
                  <th className="px-5 py-3 text-left font-medium">Cumulative GPA</th>
                  <th className="px-5 py-3 text-left font-medium">Credits</th>
                  <th className="px-5 py-3 text-left font-medium">Standing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {standings.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">{s.student_name}</td>
                    <td className="px-5 py-3 text-gray-600">{s.term_name}</td>
                    <td className="px-5 py-3 text-gray-900 font-medium">{s.gpa.toFixed(2)}</td>
                    <td className="px-5 py-3 text-gray-900">{s.cumulative_gpa.toFixed(2)}</td>
                    <td className="px-5 py-3 text-gray-600">{s.credits_earned}/{s.credits_attempted}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${standingBadge(s.standing)}`}>
                        {s.standing}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Add Academic Standing</h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-2 rounded hover:bg-gray-100">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              {formError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{formError}</div>}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Student *</label>
                  <select value={formData.student_id} onChange={e => setFormData(p => ({ ...p, student_id: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                    <option value="">Select student...</option>
                    {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Term *</label>
                  <select value={formData.term_id} onChange={e => setFormData(p => ({ ...p, term_id: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                    <option value="">Select term...</option>
                    {terms.map(t => <option key={t.id} value={t.id}>{t.term_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">GPA *</label>
                  <input type="number" step="0.01" min="0" max="4" value={formData.gpa} onChange={e => setFormData(p => ({ ...p, gpa: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cumulative GPA *</label>
                  <input type="number" step="0.01" min="0" max="4" value={formData.cumulative_gpa} onChange={e => setFormData(p => ({ ...p, cumulative_gpa: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Credits Earned *</label>
                  <input type="number" min="0" value={formData.credits_earned} onChange={e => setFormData(p => ({ ...p, credits_earned: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Credits Attempted *</label>
                  <input type="number" min="0" value={formData.credits_attempted} onChange={e => setFormData(p => ({ ...p, credits_attempted: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Standing *</label>
                  <select value={formData.standing} onChange={e => setFormData(p => ({ ...p, standing: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                    {['good', 'warning', 'probation', 'suspension', 'dismissed', 'honors'].map(s => (
                      <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={handleAddStanding} disabled={formLoading} className="flex-1 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                  {formLoading ? 'Saving...' : 'Save Standing'}
                </button>
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
