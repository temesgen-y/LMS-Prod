'use client';

import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

type AcademicTerm = {
  id: string;
  academicYearLabel: string;
  termName: string;
  termCode: string;
  startDate: string;
  endDate: string;
  status: string;
  isCurrent: boolean;
};

const PAGE_SIZE = 10;
const TERM_CODES = ['SEM1', 'SEM2', 'SUMMER'];
const STATUSES = ['upcoming', 'active', 'closed'];

const initialForm = {
  academicYearLabel: '',
  yearStart: '',
  termName: '',
  termCode: 'SEM1',
  termNumber: '1',
  startDate: '',
  endDate: '',
  status: 'upcoming',
  isCurrent: false,
};

export default function AdminAcademicTermsPage() {
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchTerms = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('academic_terms')
      .select('id, academic_year_label, term_name, term_code, start_date, end_date, status, is_current')
      .order('year_start', { ascending: false })
      .order('term_number', { ascending: true, nullsFirst: false });

    if (error) {
      toast.error('Failed to load academic terms.');
    } else {
      setTerms(
        (data ?? []).map((row: any) => ({
          id: row.id,
          academicYearLabel: row.academic_year_label ?? '—',
          termName: row.term_name ?? '—',
          termCode: row.term_code ?? '—',
          startDate: row.start_date ?? '—',
          endDate: row.end_date ?? '—',
          status: row.status ?? '—',
          isCurrent: row.is_current ?? false,
        }))
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchTerms(); }, [fetchTerms]);

  // Auto-fill year label and year_end when yearStart changes
  const handleYearStartChange = (value: string) => {
    const y = parseInt(value, 10);
    const label = !isNaN(y) ? `${y}-${y + 1}` : '';
    setForm((f) => ({ ...f, yearStart: value, academicYearLabel: label }));
  };

  // Auto-set term_number when term_code changes
  const handleTermCodeChange = (value: string) => {
    const num = value === 'SEM1' ? '1' : value === 'SEM2' ? '2' : '';
    setForm((f) => ({ ...f, termCode: value, termNumber: num }));
  };

  const openModal = useCallback(() => {
    setForm(initialForm);
    setSubmitError('');
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    if (!isSubmitting) setModalOpen(false);
  }, [isSubmitting]);

  useEffect(() => {
    if (!modalOpen) return;
    const onEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [modalOpen, closeModal]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    const yearStart = parseInt(form.yearStart, 10);
    if (!form.academicYearLabel.trim()) { setSubmitError('Academic year is required.'); return; }
    if (isNaN(yearStart)) { setSubmitError('Start year must be a valid number.'); return; }
    if (!form.termName.trim()) { setSubmitError('Term name is required.'); return; }
    if (!form.startDate) { setSubmitError('Start date is required.'); return; }
    if (!form.endDate) { setSubmitError('End date is required.'); return; }
    if (form.endDate <= form.startDate) { setSubmitError('End date must be after start date.'); return; }

    setIsSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.from('academic_terms').insert({
      academic_year_label: form.academicYearLabel.trim(),
      year_start: yearStart,
      year_end: yearStart + 1,
      term_name: form.termName.trim(),
      term_code: form.termCode,
      term_number: form.termCode === 'SUMMER' ? null : parseInt(form.termNumber, 10),
      start_date: form.startDate,
      end_date: form.endDate,
      status: form.status,
      is_current: form.isCurrent,
    });

    if (error) {
      const msg = error.message ?? '';
      if (msg.includes('uq_academic_terms_year_term')) {
        setSubmitError('This term already exists for that academic year.');
      } else if (msg.includes('uq_one_current_term')) {
        setSubmitError('Another term is already marked as current. Unmark it first.');
      } else {
        setSubmitError(msg || 'Failed to create term.');
      }
      setIsSubmitting(false);
      return;
    }

    toast.success(`Term "${form.termName}" created successfully.`);
    setModalOpen(false);
    setForm(initialForm);
    fetchTerms();
    setIsSubmitting(false);
  };

  const filtered = terms.filter((t) =>
    t.academicYearLabel.toLowerCase().includes(search.toLowerCase()) ||
    t.termName.toLowerCase().includes(search.toLowerCase()) ||
    t.termCode.toLowerCase().includes(search.toLowerCase()) ||
    t.status.toLowerCase().includes(search.toLowerCase())
  );

  const totalCount = filtered.length;
  const start = (page - 1) * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, totalCount);
  const paginated = filtered.slice(start, end);

  const statusColor = (s: string) => {
    if (s === 'active') return 'text-green-600';
    if (s === 'closed') return 'text-gray-400';
    return 'text-yellow-600';
  };

  return (
    <div className="space-y-6">
      {/* Search and action bar */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center">
        <div className="relative flex-1 max-w-md">
          <input
            type="search"
            placeholder="Search terms..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <button
          type="button" onClick={openModal}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition shrink-0"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Term
        </button>
      </div>

      {/* Modal */}
      {modalOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" aria-hidden onClick={closeModal} />
          <div
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md max-h-[90vh] flex flex-col bg-white rounded-xl shadow-xl border border-gray-200"
            role="dialog" aria-modal="true" aria-labelledby="add-term-title"
          >
            <div className="flex items-center justify-between shrink-0 p-6 pb-0">
              <h2 id="add-term-title" className="text-lg font-bold text-gray-900">Add Academic Term</h2>
              <button type="button" onClick={() => setModalOpen(false)} disabled={isSubmitting}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-50" aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 p-6">
              <div className="space-y-4 overflow-y-auto pr-1">
                {submitError && (
                  <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2">{submitError}</div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="term-year-start" className="block text-sm font-medium text-gray-700 mb-1">Start Year *</label>
                    <input id="term-year-start" type="number" required value={form.yearStart}
                      placeholder="e.g. 2025"
                      onChange={(e) => handleYearStartChange(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                  <div>
                    <label htmlFor="term-year-label" className="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
                    <input id="term-year-label" type="text" value={form.academicYearLabel} readOnly
                      placeholder="Auto-filled"
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="term-code" className="block text-sm font-medium text-gray-700 mb-1">Term *</label>
                  <select id="term-code" value={form.termCode}
                    onChange={(e) => handleTermCodeChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    {TERM_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="term-name" className="block text-sm font-medium text-gray-700 mb-1">Term Name *</label>
                  <input id="term-name" type="text" required value={form.termName}
                    placeholder="e.g. Semester 1"
                    onChange={(e) => setForm((f) => ({ ...f, termName: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="term-start" className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
                    <input id="term-start" type="date" required value={form.startDate}
                      onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                  <div>
                    <label htmlFor="term-end" className="block text-sm font-medium text-gray-700 mb-1">End Date *</label>
                    <input id="term-end" type="date" required value={form.endDate}
                      onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="term-status" className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select id="term-status" value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <input id="term-current" type="checkbox" checked={form.isCurrent}
                    onChange={(e) => setForm((f) => ({ ...f, isCurrent: e.target.checked }))}
                    className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <label htmlFor="term-current" className="text-sm font-medium text-gray-700">Mark as Current Term</label>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4 mt-4 shrink-0 border-t border-gray-100">
                <button type="button" onClick={() => setModalOpen(false)} disabled={isSubmitting}
                  className="px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition disabled:opacity-50"
                >Cancel</button>
                <button type="submit" disabled={isSubmitting}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition disabled:opacity-50 min-w-[110px]"
                >
                  {isSubmitting ? 'Creating...' : 'Add Term'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/80">
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Academic Year</th>
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Term Name</th>
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Code</th>
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Start Date</th>
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">End Date</th>
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Status</th>
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-gray-500">Loading terms...</td></tr>
              ) : paginated.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-gray-500">
                  {search ? 'No terms match your search.' : 'No academic terms found.'}
                </td></tr>
              ) : (
                paginated.map((term) => (
                  <tr key={term.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-5 py-3 text-sm font-medium text-gray-900">
                      {term.academicYearLabel}
                      {term.isCurrent && (
                        <span className="ml-2 text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">Current</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600">{term.termName}</td>
                    <td className="px-5 py-3 text-sm text-gray-600">{term.termCode}</td>
                    <td className="px-5 py-3 text-sm text-gray-600">{term.startDate}</td>
                    <td className="px-5 py-3 text-sm text-gray-600">{term.endDate}</td>
                    <td className="px-5 py-3">
                      <span className={`text-sm font-medium capitalize ${statusColor(term.status)}`}>
                        {term.status}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <button type="button" className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900" title="View">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>
                        <button type="button" className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900" title="Edit">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button type="button" className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-red-600" title="Delete">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-3 px-5 py-3 border-t border-gray-200 bg-gray-50/50">
          <p className="text-sm text-gray-600">
            {totalCount === 0 ? 'No results' : `Showing ${start + 1}-${end} of ${totalCount}`}
          </p>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
              className="p-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none" aria-label="Previous page"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button type="button" onClick={() => setPage((p) => p + 1)} disabled={end >= totalCount}
              className="p-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none" aria-label="Next page"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
