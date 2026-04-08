'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { findDeptHeadForInstructor } from '@/utils/findDeptHead';

export default function LeaveRequestPage() {
  const router = useRouter();
  const [currentUserId, setCurrentUserId] = useState('');
  const [deptHeadId, setDeptHeadId] = useState('');
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState({
    leave_type: 'annual',
    start_date: '',
    end_date: '',
    reason: '',
    coverage_plan: '',
  });

  useEffect(() => {
    const init = async () => {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { router.replace('/login'); return; }
      const { data: currentUser } = await supabase.from('users').select('id').eq('auth_user_id', authUser.id).single();
      if (!currentUser) return;
      const userId = (currentUser as any).id;
      setCurrentUserId(userId);

      // Get dept head for this instructor's department
      const notifyId = await findDeptHeadForInstructor(supabase, userId);
      if (notifyId) setDeptHeadId(notifyId);
      setInitLoading(false);
    };
    init();
  }, [router]);

  const calcDays = () => {
    if (!form.start_date || !form.end_date) return 0;
    const start = new Date(form.start_date);
    const end = new Date(form.end_date);
    if (end < start) return 0;
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  };

  const totalDays = calcDays();

  const rules = [
    { label: 'Reason at least 10 characters', met: form.reason.length >= 10 },
    { label: 'Start date selected', met: !!form.start_date },
    { label: 'End date is on or after start date', met: !!(form.start_date && form.end_date && new Date(form.end_date) >= new Date(form.start_date)) },
  ];

  const isValid = rules.every(r => r.met);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    setLoading(true);
    setError('');
    try {
      const supabase = createClient();
      const { error: insertErr } = await supabase.from('leave_requests').insert({
        requester_id: currentUserId,
        leave_type: form.leave_type,
        start_date: form.start_date,
        end_date: form.end_date,
        total_days: totalDays,
        reason: form.reason,
        coverage_plan: form.coverage_plan || null,
        status: 'pending',
      });
      if (insertErr) throw new Error(insertErr.message);

      // Notify dept head
      if (deptHeadId) {
        await supabase.from('notifications').insert({
          user_id: deptHeadId,
          title: 'New Leave Request',
          body: `An instructor has submitted a ${form.leave_type} leave request for ${totalDays} day(s).`,
          type: 'leave',
          link: '/dept-head/leave',
        });
      }

      setSuccess(true);
      setForm({ leave_type: 'annual', start_date: '', end_date: '', reason: '', coverage_plan: '' });
    } catch (e: any) {
      setError(e.message ?? 'Failed to submit leave request');
    } finally {
      setLoading(false);
    }
  };

  if (initLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-700" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Request Leave</h1>

      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm mb-6">
          Your leave request has been submitted successfully. Your department head will review it.
          <button type="button" onClick={() => setSuccess(false)} className="ml-2 underline">Submit another</button>
        </div>
      )}

      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">{error}</div>}

      {!success && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Leave Type *</label>
            <select
              value={form.leave_type}
              onChange={e => setForm(p => ({ ...p, leave_type: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              {['annual', 'sick', 'emergency', 'maternity', 'paternity', 'study', 'unpaid'].map(t => (
                <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
              <input
                type="date"
                value={form.start_date}
                onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date *</label>
              <input
                type="date"
                value={form.end_date}
                min={form.start_date}
                onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          {totalDays > 0 && (
            <div className="bg-purple-50 rounded-lg p-3 text-sm text-purple-700 font-medium">
              Total Days: {totalDays} day{totalDays !== 1 ? 's' : ''}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
            <textarea
              value={form.reason}
              onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
              rows={4}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="Explain the reason for your leave request..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Coverage Plan</label>
            <textarea
              value={form.coverage_plan}
              onChange={e => setForm(p => ({ ...p, coverage_plan: e.target.value }))}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="Who will cover your classes? What arrangements have been made?"
            />
          </div>

          {/* Validation checklist */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Checklist</p>
            {rules.map((rule, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className={rule.met ? 'text-green-600' : 'text-gray-400'}>
                  {rule.met ? '✓' : '○'}
                </span>
                <span className={rule.met ? 'text-green-700' : 'text-gray-500'}>{rule.label}</span>
              </div>
            ))}
          </div>

          <button
            type="submit"
            disabled={loading || !isValid}
            className="w-full py-2.5 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {loading ? 'Submitting...' : 'Submit Leave Request'}
          </button>
        </form>
      )}
    </div>
  );
}
