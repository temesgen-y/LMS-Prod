'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface CalendarEvent {
  id: string;
  event_name: string;
  event_type: string;
  event_date: string;
  end_date: string | null;
  description: string | null;
  term_name: string;
  term_id: string;
}

interface Term { id: string; term_name: string; }

function eventTypeBadge(type: string) {
  const map: Record<string, string> = {
    registration_start: 'bg-purple-100 text-purple-800',
    registration_end: 'bg-purple-200 text-purple-900',
    classes_start: 'bg-green-100 text-green-800',
    classes_end: 'bg-green-200 text-green-900',
    add_drop_deadline: 'bg-yellow-100 text-yellow-800',
    withdrawal_deadline: 'bg-orange-100 text-orange-800',
    exam_start: 'bg-red-100 text-red-800',
    exam_end: 'bg-red-200 text-red-900',
    grade_submission_deadline: 'bg-pink-100 text-pink-800',
    holiday: 'bg-blue-100 text-blue-800',
    graduation: 'bg-indigo-100 text-indigo-800',
    other: 'bg-gray-100 text-gray-600',
  };
  return map[type] ?? 'bg-gray-100 text-gray-600';
}

export default function CalendarPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [selectedTerm, setSelectedTerm] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    event_name: '',
    event_type: 'other',
    event_date: '',
    end_date: '',
    description: '',
    term_id: '',
    applies_to: 'all',
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

      const [eventRes, termRes] = await Promise.all([
        supabase.from('academic_calendar')
          .select('id, event_name, event_type, event_date, end_date, description, academic_terms(id, term_name)')
          .order('event_date', { ascending: true }),
        supabase.from('academic_terms').select('id, term_name').order('start_date', { ascending: false }),
      ]);

      setEvents(((eventRes.data ?? []) as any[]).map(e => ({
        id: e.id,
        event_name: e.event_name,
        event_type: e.event_type,
        event_date: e.event_date,
        end_date: e.end_date,
        description: e.description,
        term_name: e.academic_terms?.term_name ?? '—',
        term_id: e.academic_terms?.id ?? '',
      })));

      setTerms((termRes.data ?? []) as Term[]);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = events.filter(e => {
    if (selectedTerm && e.term_id !== selectedTerm) return false;
    if (selectedType && e.event_type !== selectedType) return false;
    return true;
  });

  const handleAddEvent = async () => {
    if (!formData.event_name || !formData.event_date || !formData.term_id) {
      setFormError('Please fill in event name, date, and term.');
      return;
    }
    setFormLoading(true);
    setFormError('');
    try {
      const supabase = createClient();
      const { error: insertErr } = await supabase.from('academic_calendar').insert({
        event_name: formData.event_name,
        event_type: formData.event_type,
        event_date: formData.event_date,
        end_date: formData.end_date || null,
        description: formData.description || null,
        term_id: formData.term_id,
        applies_to: formData.applies_to,
        created_by: currentUserId,
      });
      if (insertErr) throw new Error(insertErr.message);
      setShowModal(false);
      setFormData({ event_name: '', event_type: 'other', event_date: '', end_date: '', description: '', term_id: '', applies_to: 'all' });
      loadData();
    } catch (e: any) {
      setFormError(e.message ?? 'Failed to save');
    } finally {
      setFormLoading(false);
    }
  };

  const eventTypes = ['registration_start','registration_end','classes_start','classes_end','add_drop_deadline','withdrawal_deadline','exam_start','exam_end','grade_submission_deadline','holiday','graduation','other'];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-700" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Academic Calendar</h1>
        <button
          type="button"
          onClick={() => { setShowModal(true); setFormError(''); }}
          className="px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-sm font-medium"
        >
          + Add Event
        </button>
      </div>
      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">{error}</div>}

      <div className="flex flex-wrap gap-3 mb-6">
        <select value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
          <option value="">All Terms</option>
          {terms.map(t => <option key={t.id} value={t.id}>{t.term_name}</option>)}
        </select>
        <select value={selectedType} onChange={e => setSelectedType(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
          <option value="">All Types</option>
          {eventTypes.map(t => <option key={t} value={t} className="capitalize">{t.replace(/_/g, ' ')}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <p className="text-sm">No calendar events found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(e => (
            <div key={e.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-4">
              <div className="shrink-0 w-14 text-center">
                <div className="text-lg font-bold text-gray-900">{new Date(e.event_date + 'T12:00:00').getDate()}</div>
                <div className="text-xs text-gray-500 uppercase">{new Date(e.event_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' })}</div>
                <div className="text-xs text-gray-400">{new Date(e.event_date + 'T12:00:00').getFullYear()}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-medium text-gray-900">{e.event_name}</h3>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${eventTypeBadge(e.event_type)}`}>
                    {e.event_type.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{e.term_name}</p>
                {e.description && <p className="text-sm text-gray-600 mt-1">{e.description}</p>}
                {e.end_date && e.end_date !== e.event_date && (
                  <p className="text-xs text-gray-400 mt-1">Ends: {new Date(e.end_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Add Calendar Event</h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-2 rounded hover:bg-gray-100">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              {formError && <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{formError}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Event Name *</label>
                <input type="text" value={formData.event_name} onChange={e => setFormData(p => ({ ...p, event_name: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Term *</label>
                <select value={formData.term_id} onChange={e => setFormData(p => ({ ...p, term_id: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                  <option value="">Select term...</option>
                  {terms.map(t => <option key={t.id} value={t.id}>{t.term_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Event Type</label>
                <select value={formData.event_type} onChange={e => setFormData(p => ({ ...p, event_type: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                  {eventTypes.map(t => <option key={t} value={t} className="capitalize">{t.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
                  <input type="date" value={formData.event_date} onChange={e => setFormData(p => ({ ...p, event_date: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                  <input type="date" value={formData.end_date} onChange={e => setFormData(p => ({ ...p, end_date: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={handleAddEvent} disabled={formLoading} className="flex-1 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                  {formLoading ? 'Saving...' : 'Save Event'}
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
