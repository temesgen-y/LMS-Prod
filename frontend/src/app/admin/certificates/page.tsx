'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

const PAGE_SIZE = 10;

type Certificate = {
  id: string;
  student_id: string;
  enrollment_id: string;
  offering_id: string;
  unique_code: string;
  pdf_url: string | null;
  issued_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
  student_name: string;
  student_email: string;
  offering_label: string;
};

type EnrollmentOption = {
  id: string;
  student_id: string;
  offering_id: string;
  student_name: string;
  offering_label: string;
};

const blank = () => ({
  enrollment_id: '',
  student_id: '',
  offering_id: '',
  unique_code: '',
  pdf_url: '',
  expires_at: '',
});

function generateCode(prefix = 'CERT') {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

export default function CertificatesPage() {
  const supabase = createClient();

  const [certs, setCerts] = useState<Certificate[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentOption[]>([]);
  const [search, setSearch] = useState('');
  const [filterRevoked, setFilterRevoked] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(blank());
  const [saving, setSaving] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<Certificate | null>(null);
  const [revokeReason, setRevokeReason] = useState('');

  const loadEnrollments = useCallback(async () => {
    const { data } = await supabase
      .from('enrollments')
      .select(`
        id, student_id, offering_id,
        users!fk_enrollments_student(first_name, last_name, email),
        course_offerings!fk_enrollments_offering(section_name, courses!fk_course_offerings_course(code))
      `)
      .eq('status', 'completed');
    setEnrollments((data ?? []).map((r: any) => ({
      id: r.id,
      student_id: r.student_id,
      offering_id: r.offering_id,
      student_name: r.users ? `${r.users.first_name} ${r.users.last_name}` : r.student_id,
      offering_label: r.course_offerings
        ? `${r.course_offerings.courses?.code ?? ''} – ${r.course_offerings.section_name}`
        : r.offering_id,
    })));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('certificates')
      .select(`
        id, student_id, enrollment_id, offering_id, unique_code, pdf_url,
        issued_at, expires_at, revoked_at, revoke_reason,
        users!fk_certificates_student(first_name, last_name, email),
        course_offerings!fk_certificates_offering(section_name, courses!fk_course_offerings_course(code))
      `)
      .order('issued_at', { ascending: false });

    if (error) { toast.error(error.message); setLoading(false); return; }

    setCerts((data ?? []).map((r: any) => ({
      id: r.id,
      student_id: r.student_id,
      enrollment_id: r.enrollment_id,
      offering_id: r.offering_id,
      unique_code: r.unique_code,
      pdf_url: r.pdf_url,
      issued_at: r.issued_at,
      expires_at: r.expires_at,
      revoked_at: r.revoked_at,
      revoke_reason: r.revoke_reason,
      student_name: r.users ? `${r.users.first_name} ${r.users.last_name}` : '—',
      student_email: r.users?.email ?? '',
      offering_label: r.course_offerings
        ? `${r.course_offerings.courses?.code ?? ''} – ${r.course_offerings.section_name}`
        : '—',
    })));
    setLoading(false);
  }, []);

  useEffect(() => { loadEnrollments(); load(); }, []);

  const openIssue = () => {
    setForm({ ...blank(), unique_code: generateCode() });
    setShowModal(true);
  };

  const handleEnrollmentChange = (enrollmentId: string) => {
    const en = enrollments.find(e => e.id === enrollmentId);
    setForm(f => ({
      ...f,
      enrollment_id: enrollmentId,
      student_id: en?.student_id ?? '',
      offering_id: en?.offering_id ?? '',
    }));
  };

  const handleIssue = async () => {
    if (!form.enrollment_id) { toast.error('Select a completed enrollment'); return; }
    if (!form.unique_code.trim()) { toast.error('Certificate code is required'); return; }
    setSaving(true);

    const { error } = await supabase.from('certificates').insert({
      student_id: form.student_id,
      enrollment_id: form.enrollment_id,
      offering_id: form.offering_id,
      unique_code: form.unique_code.trim(),
      pdf_url: form.pdf_url.trim() || null,
      expires_at: form.expires_at || null,
    });

    if (error) {
      if (error.message.includes('uq_certificates_enrollment')) {
        toast.error('A certificate already exists for this enrollment.');
      } else if (error.message.includes('uq_certificates_code')) {
        toast.error('Certificate code already used. Please generate a new one.');
      } else {
        toast.error(error.message);
      }
      setSaving(false);
      return;
    }
    toast.success('Certificate issued');
    setSaving(false);
    setShowModal(false);
    load();
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    if (!revokeReason.trim()) { toast.error('Revoke reason is required'); return; }
    const { error } = await supabase.from('certificates').update({
      revoked_at: new Date().toISOString(),
      revoke_reason: revokeReason.trim(),
    }).eq('id', revokeTarget.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Certificate revoked');
    setRevokeTarget(null);
    setRevokeReason('');
    load();
  };

  const filtered = certs
    .filter(c => filterRevoked === 'revoked' ? c.revoked_at !== null : filterRevoked === 'active' ? c.revoked_at === null : true)
    .filter(c => !search || `${c.student_name} ${c.student_email} ${c.unique_code}`.toLowerCase().includes(search.toLowerCase()));

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Certificates</h1>
          <p className="text-sm text-gray-500 mt-0.5">Issue and manage course completion certificates</p>
        </div>
        <button onClick={openIssue} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90">
          + Issue Certificate
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-2xl font-bold text-gray-900">{certs.length}</div>
          <div className="text-xs text-gray-500 mt-0.5">Total Issued</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-2xl font-bold text-green-600">{certs.filter(c => !c.revoked_at).length}</div>
          <div className="text-xs text-gray-500 mt-0.5">Active</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-2xl font-bold text-red-500">{certs.filter(c => c.revoked_at).length}</div>
          <div className="text-xs text-gray-500 mt-0.5">Revoked</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="search"
          placeholder="Search student, email, or code…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-72"
        />
        <select value={filterRevoked} onChange={e => { setFilterRevoked(e.target.value); setPage(1); }} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="">All</option>
          <option value="active">Active Only</option>
          <option value="revoked">Revoked Only</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500">Loading…</div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Student', 'Course', 'Certificate Code', 'Issued', 'Expires', 'Status', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginated.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">No certificates found</td></tr>
                ) : paginated.map(c => (
                  <tr key={c.id} className={`hover:bg-gray-50 ${c.revoked_at ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{c.student_name}</div>
                      <div className="text-xs text-gray-400">{c.student_email}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{c.offering_label}</td>
                    <td className="px-4 py-3">
                      <code className="text-xs bg-gray-100 px-2 py-0.5 rounded font-mono">{c.unique_code}</code>
                      {c.pdf_url && (
                        <a href={c.pdf_url} target="_blank" rel="noreferrer" className="ml-2 text-blue-500 hover:underline text-xs">PDF</a>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{new Date(c.issued_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{c.expires_at ? new Date(c.expires_at).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-3">
                      {c.revoked_at ? (
                        <div>
                          <span className="px-2 py-0.5 bg-red-100 text-red-600 rounded-full text-xs font-semibold">Revoked</span>
                          <div className="text-xs text-gray-400 mt-0.5 max-w-[140px] truncate">{c.revoke_reason}</div>
                        </div>
                      ) : (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold">Active</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {!c.revoked_at && (
                        <button onClick={() => { setRevokeTarget(c); setRevokeReason(''); }} className="text-red-500 hover:underline text-xs">Revoke</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded border text-sm disabled:opacity-40">Prev</button>
              <span className="px-3 py-1 text-sm text-gray-600">{page}/{totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1 rounded border text-sm disabled:opacity-40">Next</button>
            </div>
          )}
        </>
      )}

      {/* Issue Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-4">Issue Certificate</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Completed Enrollment <span className="text-red-500">*</span></label>
                <select
                  value={form.enrollment_id}
                  onChange={e => handleEnrollmentChange(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Select enrollment…</option>
                  {enrollments.map(e => <option key={e.id} value={e.id}>{e.student_name} — {e.offering_label}</option>)}
                </select>
                <p className="text-xs text-gray-400 mt-1">Only completed enrollments are listed.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Certificate Code <span className="text-red-500">*</span></label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.unique_code}
                    onChange={e => setForm(f => ({ ...f, unique_code: e.target.value }))}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, unique_code: generateCode() }))}
                    className="px-3 py-2 text-xs rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-600"
                  >
                    Regenerate
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PDF URL (optional)</label>
                <input
                  type="text"
                  value={form.pdf_url}
                  onChange={e => setForm(f => ({ ...f, pdf_url: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="https://…"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date (optional)</label>
                <input
                  type="date"
                  value={form.expires_at}
                  onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg border text-sm">Cancel</button>
              <button onClick={handleIssue} disabled={saving} className="px-4 py-2 bg-primary text-white rounded-lg text-sm disabled:opacity-60">
                {saving ? 'Issuing…' : 'Issue Certificate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke Modal */}
      {revokeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold mb-1">Revoke Certificate</h2>
            <p className="text-sm text-gray-600 mb-3">
              Revoking certificate for <strong>{revokeTarget.student_name}</strong> ({revokeTarget.unique_code}).
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason <span className="text-red-500">*</span></label>
              <textarea
                rows={3}
                value={revokeReason}
                onChange={e => setRevokeReason(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="Reason for revoking this certificate…"
              />
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setRevokeTarget(null)} className="px-4 py-2 rounded-lg border text-sm">Cancel</button>
              <button onClick={handleRevoke} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm">Revoke</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
