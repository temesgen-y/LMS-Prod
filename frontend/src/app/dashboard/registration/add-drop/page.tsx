'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type Offering = {
  id          : string;
  sectionName : string | null;
  schedule    : string | null;
  enrolled    : number;
  maxStudents : number | null;
  courseCode  : string;
  courseTitle : string;
  credits     : number | null;
  instructors : string;
};

type Enrollment = {
  id          : string;
  offeringId  : string;
  sectionName : string | null;
  courseCode  : string;
  courseTitle : string;
  credits     : number | null;
  termName    : string;
};

export default function AddDropPage() {
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [success, setSuccess]         = useState('');
  const [studentId, setStudentId]     = useState('');
  const [termId, setTermId]           = useState('');
  const [available, setAvailable]     = useState<Offering[]>([]);
  const [enrolled, setEnrolled]       = useState<Enrollment[]>([]);
  const [addSearch, setAddSearch]     = useState('');
  const [submitting, setSubmitting]   = useState<string | null>(null);
  const [requested, setRequested]     = useState<Set<string>>(new Set());
  const [dropConfirm, setDropConfirm] = useState<Enrollment | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;
      const { data: currentUser } = await supabase
        .from('users').select('id').eq('auth_user_id', authUser.id).single();
      if (!currentUser) return;
      const sid = (currentUser as any).id as string;
      setStudentId(sid);

      const { data: term } = await supabase
        .from('academic_terms').select('id').eq('is_current', true).maybeSingle();
      if (!term) { setError('No active term found.'); setLoading(false); return; }
      setTermId(term.id);

      // Active enrollments
      const { data: enrollData } = await supabase
        .from('enrollments')
        .select(`
          id, offering_id,
          course_offerings!offering_id(
            section_name,
            courses(code, title, credit_hours),
            academic_terms(term_name)
          )
        `)
        .eq('student_id', sid)
        .eq('status', 'active');

      const enrolledIds = new Set<string>();
      const enrolledList: Enrollment[] = ((enrollData ?? []) as any[]).map((e: any) => {
        enrolledIds.add(e.offering_id);
        return {
          id:          e.id,
          offeringId:  e.offering_id,
          sectionName: e.course_offerings?.section_name ?? null,
          courseCode:  e.course_offerings?.courses?.code ?? '—',
          courseTitle: e.course_offerings?.courses?.title ?? '—',
          credits:     e.course_offerings?.courses?.credit_hours ?? null,
          termName:    e.course_offerings?.academic_terms?.term_name ?? '—',
        };
      });
      setEnrolled(enrolledList);

      // Pending add/drop requests
      const { data: pendingReqs } = await supabase
        .from('registration_requests')
        .select('offering_id')
        .eq('student_id', sid)
        .in('request_type', ['add', 'registration'])
        .in('status', ['pending', 'approved', 'under_review']);
      const alreadyRequestedIds = new Set<string>(
        ((pendingReqs ?? []) as any[]).map((r: any) => r.offering_id)
      );

      // Available offerings
      const { data: offerData, error: offerErr } = await supabase
        .from('course_offerings')
        .select(`
          id, section_name, schedule, enrolled_count, max_students,
          courses!inner(code, title, credit_hours),
          course_instructors(
            users!instructor_id(first_name, last_name)
          )
        `)
        .eq('term_id', term.id)
        .eq('status', 'active');

      if (offerErr) throw offerErr;

      const availList: Offering[] = ((offerData ?? []) as any[])
        .filter((o: any) => !enrolledIds.has(o.id))
        .map((o: any) => {
          const instructors = ((o.course_instructors ?? []) as any[])
            .map((ci: any) => {
              const u = ci.users;
              return u ? `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() : '';
            })
            .filter(Boolean).join(', ');
          if (alreadyRequestedIds.has(o.id)) return null;
          return {
            id:          o.id,
            sectionName: o.section_name,
            schedule:    o.schedule,
            enrolled:    o.enrolled_count ?? 0,
            maxStudents: o.max_students,
            courseCode:  o.courses?.code ?? '—',
            courseTitle: o.courses?.title ?? '—',
            credits:     o.courses?.credit_hours ?? null,
            instructors: instructors || 'TBA',
          };
        })
        .filter(Boolean) as Offering[];

      setAvailable(availList);
      // pre-mark already-requested
      setRequested(alreadyRequestedIds);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const requestAdd = async (offeringId: string, courseCode: string) => {
    if (!studentId || !termId) return;
    setSubmitting(offeringId);
    setError(''); setSuccess('');
    try {
      const supabase = createClient();
      const { error: insErr } = await supabase.from('registration_requests').insert({
        student_id: studentId, offering_id: offeringId, term_id: termId,
        request_type: 'add', status: 'pending',
      });
      if (insErr) throw insErr;
      setRequested(prev => new Set([...prev, offeringId]));
      setSuccess(`Add request for ${courseCode} submitted. The registrar will review it.`);
    } catch (e: any) {
      setError(e.message ?? 'Failed to submit add request');
    } finally {
      setSubmitting(null);
    }
  };

  const requestDrop = async (enrollment: Enrollment) => {
    if (!studentId || !termId) return;
    setSubmitting(enrollment.offeringId);
    setError(''); setSuccess('');
    try {
      const supabase = createClient();
      // Check for existing pending drop request
      const { data: existing } = await supabase
        .from('registration_requests').select('id')
        .eq('student_id', studentId).eq('offering_id', enrollment.offeringId)
        .eq('request_type', 'drop').in('status', ['pending','under_review']).maybeSingle();
      if (existing) { setError(`A drop request for ${enrollment.courseCode} is already pending.`); setDropConfirm(null); setSubmitting(null); return; }

      const { error: insErr } = await supabase.from('registration_requests').insert({
        student_id: studentId, offering_id: enrollment.offeringId, term_id: termId,
        request_type: 'drop', status: 'pending',
      });
      if (insErr) throw insErr;
      setDropConfirm(null);
      setSuccess(`Drop request for ${enrollment.courseCode} submitted. The registrar will review it.`);
      load();
    } catch (e: any) {
      setError(e.message ?? 'Failed to submit drop request');
    } finally {
      setSubmitting(null);
    }
  };

  const filteredAvail = available.filter(o => {
    if (!addSearch.trim()) return true;
    const q = addSearch.toLowerCase();
    return o.courseCode.toLowerCase().includes(q) || o.courseTitle.toLowerCase().includes(q);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4c1d95]" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Add / Drop Courses</h1>
        <p className="text-sm text-gray-500 mt-1">Request to add new courses or drop existing ones for the current term.</p>
      </div>

      {error   && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
      {success && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{success}</div>}

      {/* ── SECTION 1: ADD ─────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Add a Course</h2>
          <input
            type="text"
            placeholder="Search courses..."
            value={addSearch}
            onChange={e => setAddSearch(e.target.value)}
            className="w-56 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4c1d95]"
          />
        </div>

        {filteredAvail.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 bg-gray-50 rounded-xl text-gray-400">
            <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <p className="text-sm">No courses available to add</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3 text-left font-medium">Course</th>
                    <th className="px-5 py-3 text-left font-medium">Section</th>
                    <th className="px-5 py-3 text-left font-medium">Instructor</th>
                    <th className="px-5 py-3 text-left font-medium">Schedule</th>
                    <th className="px-5 py-3 text-left font-medium">Seats</th>
                    <th className="px-5 py-3 text-left font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredAvail.map(o => {
                    const done = requested.has(o.id);
                    const full = o.maxStudents !== null && o.enrolled >= o.maxStudents;
                    return (
                      <tr key={o.id} className="hover:bg-gray-50">
                        <td className="px-5 py-3">
                          <p className="font-medium text-gray-900">{o.courseCode}</p>
                          <p className="text-xs text-gray-500">{o.courseTitle}</p>
                        </td>
                        <td className="px-5 py-3 text-gray-600">{o.sectionName ?? '—'}</td>
                        <td className="px-5 py-3 text-gray-600">{o.instructors}</td>
                        <td className="px-5 py-3 text-gray-600">{o.schedule ?? '—'}</td>
                        <td className="px-5 py-3 text-gray-600">
                          <span className={full ? 'text-red-500 font-medium' : ''}>
                            {o.maxStudents ? `${o.enrolled}/${o.maxStudents}` : `${o.enrolled}`}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <button
                            type="button"
                            disabled={done || full || submitting === o.id}
                            onClick={() => requestAdd(o.id, o.courseCode)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                              done ? 'bg-green-100 text-green-700 cursor-default'
                              : full ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                              : 'bg-[#4c1d95] hover:bg-[#5b21b6] text-white'
                            }`}
                          >
                            {submitting === o.id ? '...' : done ? '✓ Requested' : full ? 'Full' : 'Request Add'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ── SECTION 2: DROP ────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Drop a Course</h2>

        {enrolled.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 bg-gray-50 rounded-xl text-gray-400">
            <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-sm">No active enrollments</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3 text-left font-medium">Course</th>
                    <th className="px-5 py-3 text-left font-medium">Section</th>
                    <th className="px-5 py-3 text-left font-medium">Credits</th>
                    <th className="px-5 py-3 text-left font-medium">Term</th>
                    <th className="px-5 py-3 text-left font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {enrolled.map(e => (
                    <tr key={e.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <p className="font-medium text-gray-900">{e.courseCode}</p>
                        <p className="text-xs text-gray-500">{e.courseTitle}</p>
                      </td>
                      <td className="px-5 py-3 text-gray-600">{e.sectionName ?? '—'}</td>
                      <td className="px-5 py-3 text-gray-600">{e.credits ?? '—'}</td>
                      <td className="px-5 py-3 text-gray-600">{e.termName}</td>
                      <td className="px-5 py-3">
                        <button
                          type="button"
                          onClick={() => setDropConfirm(e)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-100 hover:bg-red-200 text-red-700 transition-colors"
                        >
                          Request Drop
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ── Drop Confirm Modal ──────────────────────────────────────────────── */}
      {dropConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Confirm Drop Request</h2>
            <p className="text-sm text-gray-600 mb-6">
              Submit a drop request for <strong>{dropConfirm.courseTitle}</strong> ({dropConfirm.courseCode})?
              The registrar must approve before your enrollment is removed.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => requestDrop(dropConfirm)}
                disabled={submitting === dropConfirm.offeringId}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                {submitting === dropConfirm.offeringId ? 'Submitting...' : 'Confirm Drop Request'}
              </button>
              <button
                type="button"
                onClick={() => setDropConfirm(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
