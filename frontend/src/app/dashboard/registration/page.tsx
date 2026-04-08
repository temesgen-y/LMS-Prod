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
  termName    : string;
};

function fmtSeats(enrolled: number, max: number | null) {
  if (!max) return `${enrolled} enrolled`;
  const left = max - enrolled;
  return `${left} / ${max} seats open`;
}

export default function CourseRegistrationPage() {
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');
  const [studentId, setStudentId] = useState('');
  const [termId, setTermId]       = useState('');
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [search, setSearch]       = useState('');
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<Set<string>>(new Set());

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

      // current term
      const { data: term } = await supabase
        .from('academic_terms').select('id, term_name').eq('is_current', true).maybeSingle();
      if (!term) { setError('No active term found.'); setLoading(false); return; }
      setTermId(term.id);

      // already enrolled or already requested
      const { data: enrollments } = await supabase
        .from('enrollments').select('offering_id').eq('student_id', sid).eq('status', 'active');
      const { data: existingReqs } = await supabase
        .from('registration_requests')
        .select('offering_id')
        .eq('student_id', sid)
        .in('status', ['pending', 'approved', 'under_review']);

      const enrolledIds = new Set([
        ...((enrollments ?? []) as any[]).map((e: any) => e.offering_id),
        ...((existingReqs ?? []) as any[]).map((r: any) => r.offering_id),
      ]);

      // available offerings for current term
      const { data: raw, error: offerErr } = await supabase
        .from('course_offerings')
        .select(`
          id, section_name, schedule, enrolled_count, max_students,
          courses!inner(code, title, credit_hours),
          academic_terms!inner(term_name),
          course_instructors(
            users!instructor_id(first_name, last_name)
          )
        `)
        .eq('term_id', term.id)
        .eq('status', 'active');

      if (offerErr) throw offerErr;

      const mapped: Offering[] = ((raw ?? []) as any[])
        .filter((o: any) => !enrolledIds.has(o.id))
        .map((o: any) => {
          const instructors = ((o.course_instructors ?? []) as any[])
            .map((ci: any) => {
              const u = ci.users;
              return u ? `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() : '';
            })
            .filter(Boolean)
            .join(', ');
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
            termName:    o.academic_terms?.term_name ?? '—',
          };
        });

      setOfferings(mapped);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load courses');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const requestRegister = async (offeringId: string, courseCode: string) => {
    if (!studentId || !termId) return;
    setSubmitting(offeringId);
    setError('');
    setSuccess('');
    try {
      const supabase = createClient();
      const { error: insErr } = await supabase.from('registration_requests').insert({
        student_id:   studentId,
        offering_id:  offeringId,
        term_id:      termId,
        request_type: 'registration',
        status:       'pending',
      });
      if (insErr) throw insErr;
      setSubmitted(prev => new Set([...prev, offeringId]));
      setSuccess(`Registration request for ${courseCode} submitted. The registrar will review it.`);
    } catch (e: any) {
      setError(e.message ?? 'Failed to submit request');
    } finally {
      setSubmitting(null);
    }
  };

  const filtered = offerings.filter(o => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return o.courseCode.toLowerCase().includes(q) || o.courseTitle.toLowerCase().includes(q) || (o.instructors.toLowerCase().includes(q));
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4c1d95]" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Course Registration</h1>
        <p className="text-sm text-gray-500 mt-1">Browse and request courses available for the current term.</p>
      </div>

      {error   && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
      {success && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{success}</div>}

      <div className="mb-5">
        <input
          type="text"
          placeholder="Search by course code, title or instructor..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full sm:w-96 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4c1d95]"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <p className="font-medium">No courses available</p>
          <p className="text-xs mt-1">All available courses have already been requested or you are enrolled.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(o => {
            const isSubmitted = submitted.has(o.id);
            const full = o.maxStudents !== null && o.enrolled >= o.maxStudents;
            return (
              <div key={o.id} className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-[#4c1d95]/10 text-[#4c1d95]">
                      {o.courseCode}
                    </span>
                    {o.credits && (
                      <span className="text-xs text-gray-400">{o.credits} cr</span>
                    )}
                  </div>
                  <h3 className="font-semibold text-gray-900 mt-2 text-sm leading-snug">{o.courseTitle}</h3>
                </div>
                <div className="space-y-1 text-xs text-gray-500">
                  <div className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    {o.instructors}
                  </div>
                  {o.sectionName && (
                    <div className="flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                      Section {o.sectionName}
                    </div>
                  )}
                  {o.schedule && (
                    <div className="flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      {o.schedule}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    <span className={full ? 'text-red-500 font-medium' : ''}>{fmtSeats(o.enrolled, o.maxStudents)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isSubmitted || full || submitting === o.id}
                  onClick={() => requestRegister(o.id, o.courseCode)}
                  className={`mt-auto w-full py-2 rounded-lg text-sm font-semibold transition-colors ${
                    isSubmitted
                      ? 'bg-green-100 text-green-700 cursor-default'
                      : full
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-[#4c1d95] hover:bg-[#5b21b6] text-white'
                  }`}
                >
                  {submitting === o.id ? 'Submitting...' : isSubmitted ? '✓ Requested' : full ? 'Full' : 'Request Registration'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
