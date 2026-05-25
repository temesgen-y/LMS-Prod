'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import Link from 'next/link';

type ReqStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'under_review';
type ReqType = 'registration' | 'add' | 'drop' | 'withdrawal' | 'audit';

interface RegistrationRequest {
  id: string;
  studentId: string;
  studentName: string;
  studentNo: string;
  offeringId: string;
  courseCode: string;
  courseTitle: string;
  sectionName: string;
  termName: string;
  requestType: ReqType;
  status: ReqStatus;
  reason: string | null;
  prereqOverride: boolean;
  overrideReason: string | null;
  rejectionNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

const STATUS_LABELS: Record<ReqStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  under_review: 'Under Review',
};

const STATUS_COLORS: Record<ReqStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
  under_review: 'bg-blue-100 text-blue-700',
};

const TYPE_LABELS: Record<ReqType, string> = {
  registration: 'Registration',
  add: 'Add Course',
  drop: 'Drop Course',
  withdrawal: 'Withdrawal',
  audit: 'Audit',
};

export default function RegistrationRequestsPage() {
  const supabase = createClient();
  const [advisorId, setAdvisorId] = useState('');
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<ReqStatus | ''>('pending');
  const [actionModal, setActionModal] = useState<{
    req: RegistrationRequest;
    action: 'approve' | 'approve_override' | 'reject' | 'under_review';
  } | null>(null);
  const [actionNote, setActionNote] = useState('');
  const [actioning, setActioning] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: me } = await supabase.from('users').select('id').eq('auth_user_id', user.id).single();
      if (!me) return;
      setAdvisorId((me as { id: string }).id);
    };
    init();
  }, []);

  const load = useCallback(async () => {
    if (!advisorId) return;
    setLoading(true);

    // Get assigned student IDs
    const { data: assignments } = await supabase
      .from('advisor_assignments')
      .select('student_id')
      .eq('advisor_id', advisorId)
      .eq('is_active', true);

    if (!assignments || assignments.length === 0) { setLoading(false); return; }
    const studentIds = assignments.map((a: any) => a.student_id);

    // Get registration requests for those students
    const { data: reqRows, error } = await supabase
      .from('registration_requests')
      .select('id, student_id, offering_id, term_id, request_type, status, reason, prereq_override, override_reason, rejection_note, created_at, reviewed_at')
      .in('student_id', studentIds)
      .order('created_at', { ascending: false });

    if (error) { toast.error('Failed to load requests'); setLoading(false); return; }
    if (!reqRows || reqRows.length === 0) { setRequests([]); setLoading(false); return; }

    // Fetch students
    const { data: usersData } = await supabase
      .from('users')
      .select('id, first_name, last_name, student_profiles!user_id(student_no)')
      .in('id', studentIds);

    const userMap: Record<string, { name: string; studentNo: string }> = {};
    ((usersData ?? []) as any[]).forEach(u => {
      const p = Array.isArray(u.student_profiles) ? u.student_profiles[0] : u.student_profiles;
      userMap[u.id] = {
        name: `${u.first_name} ${u.last_name}`.trim(),
        studentNo: p?.student_no ?? '—',
      };
    });

    // Fetch offerings
    const offeringIds = [...new Set((reqRows as any[]).map(r => r.offering_id))];
    const { data: offeringRows } = await supabase
      .from('course_offerings')
      .select('id, section_name, course_id, term_id')
      .in('id', offeringIds);

    const courseIds = [...new Set(((offeringRows ?? []) as any[]).map(o => o.course_id))];
    const termIds = [...new Set(((offeringRows ?? []) as any[]).map(o => o.term_id))];

    const [{ data: courseRows }, { data: termRows }] = await Promise.all([
      supabase.from('courses').select('id, code, title').in('id', courseIds),
      supabase.from('academic_terms').select('id, term_name').in('id', termIds),
    ]);

    const offeringMap: Record<string, any> = {};
    ((offeringRows ?? []) as any[]).forEach(o => { offeringMap[o.id] = o; });
    const courseMap: Record<string, any> = {};
    ((courseRows ?? []) as any[]).forEach(c => { courseMap[c.id] = c; });
    const termMap: Record<string, any> = {};
    ((termRows ?? []) as any[]).forEach(t => { termMap[t.id] = t; });

    setRequests(
      (reqRows as any[]).map(r => {
        const offering = offeringMap[r.offering_id] ?? {};
        const course = courseMap[offering.course_id ?? ''] ?? {};
        const term = termMap[offering.term_id ?? ''] ?? {};
        const student = userMap[r.student_id] ?? { name: '—', studentNo: '—' };
        return {
          id: r.id,
          studentId: r.student_id,
          studentName: student.name,
          studentNo: student.studentNo,
          offeringId: r.offering_id,
          courseCode: course.code ?? '—',
          courseTitle: course.title ?? '—',
          sectionName: offering.section_name ?? '—',
          termName: term.term_name ?? '—',
          requestType: r.request_type,
          status: r.status,
          reason: r.reason,
          prereqOverride: r.prereq_override ?? false,
          overrideReason: r.override_reason,
          rejectionNote: r.rejection_note,
          createdAt: r.created_at,
          reviewedAt: r.reviewed_at,
        };
      })
    );
    setLoading(false);
  }, [advisorId]);

  useEffect(() => { if (advisorId) load(); }, [advisorId, load]);

  const handleAction = async () => {
    if (!actionModal) return;
    const { req, action } = actionModal;
    setActioning(true);

    let update: Record<string, any> = {
      reviewed_by: advisorId,
      reviewed_at: new Date().toISOString(),
    };

    if (action === 'approve') {
      update.status = 'approved';
    } else if (action === 'approve_override') {
      if (!actionNote.trim()) { toast.error('Override reason is required'); setActioning(false); return; }
      update.status = 'approved';
      update.prereq_override = true;
      update.override_reason = actionNote.trim();
    } else if (action === 'reject') {
      if (!actionNote.trim()) { toast.error('Rejection reason is required'); setActioning(false); return; }
      update.status = 'rejected';
      update.rejection_note = actionNote.trim();
    } else if (action === 'under_review') {
      update.status = 'under_review';
    }

    const { error } = await supabase.from('registration_requests').update(update).eq('id', req.id);
    if (error) { toast.error(error.message); setActioning(false); return; }

    toast.success(
      action === 'approve' || action === 'approve_override' ? 'Request approved' :
      action === 'reject' ? 'Request rejected' : 'Marked as under review'
    );
    setActionModal(null);
    setActionNote('');
    setActioning(false);
    load();
  };

  const statusCounts = (['pending', 'under_review', 'approved', 'rejected', 'cancelled'] as ReqStatus[]).reduce(
    (acc, s) => ({ ...acc, [s]: requests.filter(r => r.status === s).length }),
    {} as Record<ReqStatus, number>
  );

  const filtered = filterStatus ? requests.filter(r => r.status === filterStatus) : requests;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Registration Requests</h1>
        <p className="text-sm text-gray-500 mt-0.5">Review and act on course registration requests from your advisees</p>
      </div>

      {/* Status filter cards */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-6">
        {(['pending', 'under_review', 'approved', 'rejected', 'cancelled'] as ReqStatus[]).map(s => (
          <button key={s} onClick={() => setFilterStatus(filterStatus === s ? '' : s)}
            className={`bg-white rounded-xl border p-4 text-left hover:shadow-sm transition ${filterStatus === s ? 'border-teal-500 ring-1 ring-teal-500' : 'border-gray-200'}`}>
            <div className={`text-2xl font-bold ${s === 'pending' ? 'text-amber-600' : s === 'approved' ? 'text-green-600' : s === 'rejected' ? 'text-red-600' : s === 'under_review' ? 'text-blue-600' : 'text-gray-500'}`}>
              {statusCounts[s] ?? 0}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">{STATUS_LABELS[s]}</div>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-400">{requests.length === 0 ? 'No registration requests from your advisees' : 'No requests match the selected filter'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(req => (
            <div key={req.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[req.status]}`}>
                      {STATUS_LABELS[req.status]}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
                      {TYPE_LABELS[req.requestType]}
                    </span>
                    {req.prereqOverride && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-700">Prereq Override</span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <Link href={`/advisor/students/${req.studentId}`}
                      className="font-semibold text-gray-900 hover:text-teal-700 text-sm">
                      {req.studentName}
                    </Link>
                    <span className="text-xs text-gray-400 font-mono">{req.studentNo}</span>
                  </div>

                  <div className="mt-1 text-sm text-gray-700">
                    <span className="font-medium">{req.courseCode}</span>
                    {' — '}{req.courseTitle}
                    {' · Section '}{req.sectionName}
                    {' · '}{req.termName}
                  </div>

                  {req.reason && (
                    <p className="text-xs text-gray-500 mt-1.5 border-l-2 border-gray-200 pl-2 italic">{req.reason}</p>
                  )}
                  {req.overrideReason && (
                    <p className="text-xs text-purple-600 mt-1 border-l-2 border-purple-200 pl-2">Override: {req.overrideReason}</p>
                  )}
                  {req.rejectionNote && (
                    <p className="text-xs text-red-600 mt-1 border-l-2 border-red-200 pl-2">Rejected: {req.rejectionNote}</p>
                  )}

                  <p className="text-xs text-gray-400 mt-1.5">
                    Submitted {new Date(req.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {req.reviewedAt && ` · Reviewed ${new Date(req.reviewedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                  </p>
                </div>

                {(req.status === 'pending' || req.status === 'under_review') && (
                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      onClick={() => { setActionModal({ req, action: 'approve' }); setActionNote(''); }}
                      className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-medium hover:bg-green-200 transition-colors">
                      Approve
                    </button>
                    <button
                      onClick={() => { setActionModal({ req, action: 'approve_override' }); setActionNote(''); }}
                      className="px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-xs font-medium hover:bg-purple-200 transition-colors">
                      Approve + Override
                    </button>
                    {req.status === 'pending' && (
                      <button
                        onClick={() => { setActionModal({ req, action: 'under_review' }); setActionNote(''); }}
                        className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-200 transition-colors">
                        Under Review
                      </button>
                    )}
                    <button
                      onClick={() => { setActionModal({ req, action: 'reject' }); setActionNote(''); }}
                      className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs font-medium hover:bg-red-200 transition-colors">
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Action modal */}
      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-1">
              {actionModal.action === 'approve' ? 'Approve Request' :
               actionModal.action === 'approve_override' ? 'Approve with Prerequisite Override' :
               actionModal.action === 'under_review' ? 'Mark as Under Review' :
               'Reject Request'}
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              {actionModal.req.studentName} — {actionModal.req.courseCode} {actionModal.req.courseTitle}
            </p>

            {actionModal.action === 'approve_override' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Override Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={actionNote}
                  onChange={e => setActionNote(e.target.value)}
                  placeholder="Explain why the prerequisite requirement is being waived…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            )}

            {actionModal.action === 'reject' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rejection Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={actionNote}
                  onChange={e => setActionNote(e.target.value)}
                  placeholder="Explain why this request is being rejected…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            )}

            {actionModal.action === 'approve' && (
              <p className="text-sm text-gray-600 mb-4">This will approve the student's {TYPE_LABELS[actionModal.req.requestType].toLowerCase()} request.</p>
            )}

            {actionModal.action === 'under_review' && (
              <p className="text-sm text-gray-600 mb-4">This marks the request as under review, pending further investigation.</p>
            )}

            <div className="flex justify-end gap-3">
              <button onClick={() => { setActionModal(null); setActionNote(''); }} disabled={actioning}
                className="px-4 py-2 rounded-lg border text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                Cancel
              </button>
              <button onClick={handleAction} disabled={actioning}
                className={`px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60 ${
                  actionModal.action === 'reject' ? 'bg-red-600 hover:bg-red-700' :
                  actionModal.action === 'approve_override' ? 'bg-purple-600 hover:bg-purple-700' :
                  'bg-teal-600 hover:bg-teal-700'
                }`}>
                {actioning ? 'Saving…' :
                  actionModal.action === 'approve' ? 'Approve' :
                  actionModal.action === 'approve_override' ? 'Approve with Override' :
                  actionModal.action === 'under_review' ? 'Mark Under Review' :
                  'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
