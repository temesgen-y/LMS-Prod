'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

type Candidate = {
  studentId: string;
  studentName: string;
  studentEmail: string;
  studentNo: string | null;
  programId: string;
  programName: string;
  programCode: string;
  degreeLevel: string | null;
  completedCredits: number;
  requiredCredits: number;
  cgpa: number;
  classification: string | null;
  eligible: boolean;
  certificate: {
    id: string;
    unique_code: string;
    pdf_url: string | null;
    issued_at: string;
    revoked_at: string | null;
    revoke_reason: string | null;
  } | null;
};

type Filter = 'all' | 'eligible' | 'issued' | 'in_progress';

function statusOf(c: Candidate): { label: string; cls: string } {
  if (c.certificate && !c.certificate.revoked_at) return { label: 'Certificate Issued', cls: 'bg-green-100 text-green-700' };
  if (c.certificate?.revoked_at) return { label: 'Revoked', cls: 'bg-red-100 text-red-600' };
  if (c.eligible) return { label: 'Eligible', cls: 'bg-purple-100 text-purple-700' };
  return { label: 'In Progress', cls: 'bg-gray-100 text-gray-600' };
}

export default function RegistrarGraduationPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('eligible');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/registrar/graduation/eligible');
    const json = await res.json();
    if (res.ok) setCandidates(json.candidates ?? []);
    else toast.error(json.error ?? 'Failed to load candidates.');
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const summary = useMemo(() => ({
    eligible: candidates.filter(c => c.eligible && !c.certificate).length,
    issued: candidates.filter(c => c.certificate && !c.certificate.revoked_at).length,
    total: candidates.length,
  }), [candidates]);

  const filtered = useMemo(() => candidates.filter(c => {
    const st = statusOf(c).label;
    if (filter === 'eligible' && !(c.eligible && !c.certificate)) return false;
    if (filter === 'issued' && !(c.certificate && !c.certificate.revoked_at)) return false;
    if (filter === 'in_progress' && !(st === 'In Progress')) return false;
    if (search) {
      const q = search.toLowerCase();
      return `${c.studentName} ${c.studentEmail} ${c.studentNo ?? ''} ${c.programName}`.toLowerCase().includes(q);
    }
    return true;
  }), [candidates, filter, search]);

  const generate = async (body: { studentIds?: string[]; all?: boolean }, rowId?: string) => {
    if (rowId) setRowBusy(rowId); else setBusy(true);
    try {
      const res = await fetch('/api/registrar/graduation/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error ?? 'Generation failed.'); return; }
      toast.success(json.message ?? 'Done.');
      if (json.failed?.length) toast.error(`${json.failed.length} failed — see details.`);
      await load();
    } finally {
      setBusy(false); setRowBusy(null);
    }
  };

  const generateAll = () => {
    if (summary.eligible === 0) { toast.info('No eligible students without a certificate.'); return; }
    if (!confirm(`Auto-generate graduation certificates for ${summary.eligible} eligible student(s)?`)) return;
    generate({ all: true });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Graduation Certificates</h1>
          <p className="text-sm text-gray-500 mt-0.5">Auto-generate degree certificates for students who met their program requirements</p>
        </div>
        <button onClick={generateAll} disabled={busy || summary.eligible === 0}
          className="px-4 py-2 bg-purple-700 text-white rounded-lg text-sm font-medium hover:bg-purple-800 disabled:opacity-50">
          {busy ? 'Generating…' : `Auto-Generate All Eligible (${summary.eligible})`}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-2xl font-bold text-purple-700">{summary.eligible}</div>
          <div className="text-xs text-gray-500 mt-0.5">Eligible (no certificate)</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-2xl font-bold text-green-600">{summary.issued}</div>
          <div className="text-xs text-gray-500 mt-0.5">Certificates Issued</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-2xl font-bold text-gray-900">{summary.total}</div>
          <div className="text-xs text-gray-500 mt-0.5">Students Tracked</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {([['eligible', 'Eligible'], ['issued', 'Issued'], ['in_progress', 'In Progress'], ['all', 'All']] as [Filter, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium ${filter === k ? 'bg-white shadow text-purple-700' : 'text-gray-500 hover:text-gray-700'}`}>
              {label}
            </button>
          ))}
        </div>
        <input type="search" placeholder="Search student or program…" value={search} onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-72" />
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500">Loading…</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Student', 'Program', 'Credits', 'CGPA', 'Classification', 'Status', 'Action'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">No students in this view</td></tr>
              ) : filtered.map(c => {
                const st = statusOf(c);
                const creditsMet = c.completedCredits >= c.requiredCredits;
                return (
                  <tr key={`${c.studentId}:${c.programId}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{c.studentName || '—'}</div>
                      <div className="text-xs text-gray-400">{c.studentNo ? `${c.studentNo} · ` : ''}{c.studentEmail}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      <div className="font-medium text-gray-700">{c.programName}</div>
                      <div className="text-gray-400 capitalize">{c.degreeLevel ?? ''}</div>
                    </td>
                    <td className={`px-4 py-3 text-xs font-medium ${creditsMet ? 'text-green-600' : 'text-gray-600'}`}>
                      {c.completedCredits} / {c.requiredCredits}
                    </td>
                    <td className={`px-4 py-3 text-xs font-medium ${c.cgpa >= 2 ? 'text-gray-800' : 'text-red-500'}`}>{c.cgpa.toFixed(2)}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{c.classification ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1 items-start">
                        {c.certificate && !c.certificate.revoked_at ? (
                          <>
                            {c.certificate.pdf_url && (
                              <a href={c.certificate.pdf_url} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline text-xs">View PDF</a>
                            )}
                            <a href={`/verify/${c.certificate.unique_code}`} target="_blank" rel="noreferrer" className="text-indigo-500 hover:underline text-xs">Verify</a>
                          </>
                        ) : c.eligible ? (
                          <button onClick={() => generate({ studentIds: [c.studentId] }, c.studentId)} disabled={rowBusy === c.studentId || busy}
                            className="px-2.5 py-1 rounded-md bg-purple-700 text-white text-xs font-medium hover:bg-purple-800 disabled:opacity-50">
                            {rowBusy === c.studentId ? 'Generating…' : 'Generate'}
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
