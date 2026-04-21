'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { recordPayment } from '@/services/fees.service';

// ── Types ──────────────────────────────────────────────────────────────────────

interface FeeAccount {
  id: string;
  student_id: string;
  student_name: string;
  student_no: string;
  term_name: string;
  term_id: string;
  total_amount: number;
  paid_amount: number;
  balance: number;
  status: string;
  due_date: string | null;
}

interface Payment {
  id: string;
  amount: number;
  payment_method: string;
  reference_no: string | null;
  payment_date: string;
  notes: string | null;
}

interface AcademicYear { label: string; }
interface Term        { id: string; name: string; year_label: string; is_current: boolean; }
interface Department  { id: string; name: string; }
interface Program     { id: string; name: string; }

interface StudentRow {
  id: string;
  name: string;
  student_no: string;
  program: string;
  has_account: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function deriveStatus(total: number, paid: number): string {
  if (paid <= 0)    return 'unpaid';
  if (paid >= total) return 'paid';
  return 'partial';
}

function statusBadge(s: string) {
  const m: Record<string, string> = {
    paid: 'bg-green-100 text-green-800', unpaid: 'bg-red-100 text-red-800',
    partial: 'bg-yellow-100 text-yellow-800', waived: 'bg-blue-100 text-blue-800',
    overdue: 'bg-orange-100 text-orange-800',
  };
  return m[s] ?? 'bg-gray-100 text-gray-600';
}

function XIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function FeesPage() {
  const router = useRouter();
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [accounts, setAccounts] = useState<FeeAccount[]>([]);
  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Payment modal
  const [paymentModal, setPaymentModal]     = useState<FeeAccount | null>(null);
  const [paymentForm, setPaymentForm]       = useState({ amount: '', payment_method: 'cash', reference_no: '', notes: '' });
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError]     = useState('');

  // Statement modal
  const [statementsModal, setStatementsModal] = useState<FeeAccount | null>(null);
  const [payments, setPayments]               = useState<Payment[]>([]);

  // Edit modal
  const [editModal, setEditModal]           = useState<FeeAccount | null>(null);
  const [editTotalAmount, setEditTotalAmount] = useState('');
  const [editDueDate, setEditDueDate]         = useState('');
  const [editLoading, setEditLoading]         = useState(false);
  const [editError, setEditError]             = useState('');

  // Delete confirm
  const [deleteTarget, setDeleteTarget]   = useState<FeeAccount | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError]     = useState('');

  // Notify state
  const [notifyLoading, setNotifyLoading]   = useState<string | null>(null); // account id

  // Create modal
  const [createModal, setCreateModal]     = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError]     = useState('');

  // Reference data
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [allTerms, setAllTerms]           = useState<Term[]>([]);
  const [departments, setDepartments]     = useState<Department[]>([]);
  const [programs, setPrograms]           = useState<Program[]>([]);
  const [allStudents, setAllStudents]     = useState<StudentRow[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);

  // Form state
  const [selYear, setSelYear]           = useState('');
  const [selTermId, setSelTermId]       = useState('');
  const [selDeptId, setSelDeptId]       = useState('');
  const [selProgramId, setSelProgramId] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [totalAmount, setTotalAmount]   = useState('');
  const [dueDate, setDueDate]           = useState('');
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());

  // ── Load main table ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { router.replace('/login'); return; }

      const { data, error: err } = await supabase
        .from('student_fee_accounts')
        .select(`
          id, student_id, total_amount, paid_amount, balance, status, due_date,
          users!student_id(first_name, last_name, student_profiles!user_id(student_no)),
          academic_terms!term_id(id, term_name)
        `)
        .order('created_at', { ascending: false });

      if (err) throw new Error(err.message);

      setAccounts(((data ?? []) as any[]).map(a => ({
        id:           a.id,
        student_id:   a.student_id,
        student_name: a.users ? `${a.users.first_name ?? ''} ${a.users.last_name ?? ''}`.trim() : 'Unknown',
        student_no:   a.users?.student_profiles?.student_no ?? '—',
        term_name:    a.academic_terms?.term_name ?? '—',
        term_id:      a.academic_terms?.id ?? '',
        total_amount: a.total_amount,
        paid_amount:  a.paid_amount,
        balance:      a.balance,
        status:       a.status,
        due_date:     a.due_date,
      })));
    } catch (e: any) {
      setError(e.message ?? 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Send notification for a single fee account ───────────────────────────────

  const sendNotification = async (account: FeeAccount) => {
    setNotifyLoading(account.id);
    try {
      const supabase = createClient();
      await supabase.from('notifications').insert({
        user_id: account.student_id,
        type:    'payment_due',
        title:   'Fee Payment Due',
        body:    `Your fee balance of ETB ${account.balance.toLocaleString()} for ${account.term_name} is outstanding.${account.due_date ? ` Due date: ${new Date(account.due_date).toLocaleDateString()}.` : ''}`,
        link:    '/dashboard/fees',
      });
    } finally {
      setNotifyLoading(null);
    }
  };

  // ── Edit ─────────────────────────────────────────────────────────────────────

  const openEditModal = (a: FeeAccount) => {
    setEditModal(a);
    setEditTotalAmount(a.total_amount.toString());
    setEditDueDate(a.due_date ?? '');
    setEditError('');
  };

  const handleEdit = async () => {
    if (!editModal) return;
    const newTotal = parseFloat(editTotalAmount);
    if (isNaN(newTotal) || newTotal <= 0) { setEditError('Enter a valid total amount.'); return; }
    if (newTotal < editModal.paid_amount)  { setEditError(`Total cannot be less than already paid (ETB ${editModal.paid_amount.toLocaleString()}).`); return; }
    setEditLoading(true); setEditError('');
    try {
      const supabase = createClient();
      const { error: e } = await supabase.from('student_fee_accounts').update({
        total_amount: newTotal,
        balance:      newTotal - editModal.paid_amount,
        status:       deriveStatus(newTotal, editModal.paid_amount),
        due_date:     editDueDate || null,
      }).eq('id', editModal.id);
      if (e) throw new Error(e.message);
      setEditModal(null);
      loadData();
    } catch (e: any) {
      setEditError(e.message ?? 'Update failed');
    } finally {
      setEditLoading(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true); setDeleteError('');
    try {
      const supabase = createClient();
      const { error: e } = await supabase.from('student_fee_accounts').delete().eq('id', deleteTarget.id);
      if (e) throw new Error(e.message);
      setDeleteTarget(null);
      loadData();
    } catch (e: any) {
      setDeleteError(e.message ?? 'Delete failed');
    } finally {
      setDeleteLoading(false);
    }
  };

  // ── Open create modal ─────────────────────────────────────────────────────────

  const openCreateModal = async () => {
    setCreateError(''); setSelYear(''); setSelTermId('');
    setSelDeptId(''); setSelProgramId(''); setStudentSearch('');
    setTotalAmount(''); setDueDate('');
    setSelectedStudents(new Set()); setAllStudents([]);
    setPrograms([]);
    setCreateModal(true);

    const supabase = createClient();
    const [{ data: termData }, { data: deptData }] = await Promise.all([
      supabase.from('academic_terms').select('id, term_name, academic_year_label, is_current').order('year_start', { ascending: false }),
      supabase.from('departments').select('id, name').eq('is_active', true).order('name'),
    ]);

    const terms: Term[] = ((termData ?? []) as any[]).map(t => ({
      id: t.id, name: t.term_name, year_label: t.academic_year_label, is_current: t.is_current,
    }));
    const years: AcademicYear[] = [];
    const seen = new Set<string>();
    for (const t of terms) { if (!seen.has(t.year_label)) { seen.add(t.year_label); years.push({ label: t.year_label }); } }

    setAllTerms(terms);
    setAcademicYears(years);
    setDepartments(((deptData ?? []) as any[]).map(d => ({ id: d.id, name: d.name })));
  };

  // When department changes → load programs
  const handleDeptChange = async (deptId: string) => {
    setSelDeptId(deptId);
    setSelProgramId('');
    if (!deptId) { setPrograms([]); return; }
    const supabase = createClient();
    const { data } = await supabase.from('academic_programs').select('id, name').eq('department_id', deptId).eq('is_active', true).order('name');
    setPrograms(((data ?? []) as any[]).map(p => ({ id: p.id, name: p.name })));
  };

  // Load all active students + mark who already has an account for the selected term
  const loadStudents = useCallback(async (termId: string) => {
    if (!termId) { setAllStudents([]); return; }
    setStudentsLoading(true);
    try {
      const supabase = createClient();
      const [{ data: stuData }, { data: existing }] = await Promise.all([
        supabase
          .from('users')
          .select('id, first_name, last_name, student_profiles!user_id(student_no, program)')
          .eq('role', 'student')
          .eq('status', 'active')
          .order('first_name'),
        supabase.from('student_fee_accounts').select('student_id').eq('term_id', termId),
      ]);

      const existingSet = new Set<string>((existing ?? []).map((a: any) => a.student_id));

      const rows: StudentRow[] = ((stuData ?? []) as any[]).map(s => ({
        id:          s.id,
        name:        `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim(),
        student_no:  s.student_profiles?.student_no ?? '—',
        program:     s.student_profiles?.program ?? '—',
        has_account: existingSet.has(s.id),
      }));

      setAllStudents(rows);
      // Auto-select all eligible students
      setSelectedStudents(new Set(rows.filter(r => !r.has_account).map(r => r.id)));
    } finally {
      setStudentsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (createModal && selTermId) loadStudents(selTermId);
    else setAllStudents([]);
  }, [createModal, selTermId, loadStudents]);

  // Derive visible students based on dept / program / search filters
  const visibleStudents = allStudents.filter(s => {
    if (studentSearch.trim()) {
      const q = studentSearch.toLowerCase();
      if (!s.name.toLowerCase().includes(q) && !s.student_no.toLowerCase().includes(q) && !s.program.toLowerCase().includes(q)) return false;
    }
    if (selProgramId) {
      const prog = programs.find(p => p.id === selProgramId);
      if (prog && !s.program.toLowerCase().includes(prog.name.toLowerCase())) return false;
    } else if (selDeptId) {
      // filter by any program name in this department
      if (programs.length > 0) {
        const match = programs.some(p => s.program.toLowerCase().includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(s.program.toLowerCase()));
        if (!match) return false;
      }
      // if no programs loaded yet, show all
    }
    return true;
  });

  // ── Bulk create + notify ──────────────────────────────────────────────────────

  const handleCreateFeeAccounts = async () => {
    if (!selTermId)              { setCreateError('Select an academic term.'); return; }
    if (!totalAmount)            { setCreateError('Enter the total fee amount.'); return; }
    const amt = parseFloat(totalAmount);
    if (isNaN(amt) || amt <= 0) { setCreateError('Enter a valid amount.'); return; }
    if (selectedStudents.size === 0) { setCreateError('Select at least one student.'); return; }

    setCreateLoading(true); setCreateError('');
    try {
      const supabase = createClient();
      const selTermName = allTerms.find(t => t.id === selTermId)?.name ?? 'this term';

      // Bulk-insert fee accounts
      const feeRows = [...selectedStudents].map(student_id => ({
        student_id, term_id: selTermId,
        total_amount: amt, paid_amount: 0, balance: amt,
        status: 'unpaid', due_date: dueDate || null,
      }));
      const { error: insErr } = await supabase.from('student_fee_accounts').insert(feeRows);
      if (insErr) throw new Error(insErr.message);

      // Send in-app notification to each student
      const notifRows = [...selectedStudents].map(student_id => ({
        user_id:  student_id,
        type:     'payment_due',
        title:    'Fee Payment Due',
        body:     `Your fee of ETB ${amt.toLocaleString()} for ${selTermName} has been issued.${dueDate ? ` Due: ${new Date(dueDate).toLocaleDateString()}.` : ''} Please visit your Fee Account page to pay online.`,
        link:     '/dashboard/fees',
      }));
      await supabase.from('notifications').insert(notifRows);

      setCreateModal(false);
      loadData();
    } catch (e: any) {
      setCreateError(e.message ?? 'Failed to create fee accounts');
    } finally {
      setCreateLoading(false);
    }
  };

  // ── Statement & payment ───────────────────────────────────────────────────────

  const loadPayments = async (account: FeeAccount) => {
    const supabase = createClient();
    const { data } = await supabase.from('payments')
      .select('id, amount, payment_method, reference_no, payment_date, notes')
      .eq('student_id', account.student_id).eq('term_id', account.term_id)
      .order('payment_date', { ascending: false });
    setPayments((data ?? []) as Payment[]);
    setStatementsModal(account);
  };

  const handleRecordPayment = async () => {
    if (!paymentModal || !paymentForm.amount) return;
    const amount = parseFloat(paymentForm.amount);
    if (isNaN(amount) || amount <= 0) { setPaymentError('Enter a valid amount.'); return; }
    setPaymentLoading(true); setPaymentError('');
    try {
      await recordPayment(
        paymentModal.id, paymentModal.student_id, paymentModal.term_id, amount,
        paymentForm.payment_method, paymentForm.reference_no || null,
        new Date().toISOString().split('T')[0], paymentForm.notes || null,
      );
      setPaymentModal(null);
      setPaymentForm({ amount: '', payment_method: 'cash', reference_no: '', notes: '' });
      loadData();
    } catch (e: any) {
      setPaymentError(e.message ?? 'Payment failed');
    } finally {
      setPaymentLoading(false);
    }
  };

  // ── Derived state ─────────────────────────────────────────────────────────────

  const filteredTerms = selYear ? allTerms.filter(t => t.year_label === selYear) : allTerms;

  const filtered = accounts.filter(a => {
    if (statusFilter !== 'all' && a.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return a.student_name.toLowerCase().includes(q) || a.student_no.toLowerCase().includes(q);
  });

  const statusCounts = accounts.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] ?? 0) + 1; return acc;
  }, {});

  const eligibleVisible  = visibleStudents.filter(r => !r.has_account);
  const allEligSelected  = eligibleVisible.length > 0 && eligibleVisible.every(r => selectedStudents.has(r.id));
  const toggleAll        = () => setSelectedStudents(allEligSelected ? new Set() : new Set(eligibleVisible.map(r => r.id)));
  const toggleStudent    = (id: string) => setSelectedStudents(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-700" />
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Student Fee Accounts</h1>
        <button type="button" onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-sm font-medium">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Fee Accounts
        </button>
      </div>

      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">{error}</div>}

      {/* Status cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {(['all','paid','unpaid','partial','overdue'] as const).map(s => (
          <button key={s} type="button" onClick={() => setStatusFilter(s)}
            className={`rounded-xl border p-3 text-left transition-colors ${statusFilter === s ? 'border-purple-500 bg-purple-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
            <p className="text-xs text-gray-500 capitalize mb-0.5">{s === 'all' ? 'All Students' : s}</p>
            <p className="text-xl font-bold text-gray-900">{s === 'all' ? accounts.length : (statusCounts[s] ?? 0)}</p>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4 flex items-center gap-3">
        <input type="text" placeholder="Search by student name or number…" value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full sm:w-80 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
        {statusFilter !== 'all' && (
          <button type="button" onClick={() => setStatusFilter('all')} className="text-xs text-purple-700 hover:underline">Clear filter</button>
        )}
      </div>

      {/* Main table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <p className="text-sm">{accounts.length === 0 ? 'No fee accounts yet. Use "Create Fee Accounts" to add them.' : 'No accounts match this filter.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Student</th>
                  <th className="px-4 py-3 text-left font-medium">Term</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 text-right font-medium">Paid</th>
                  <th className="px-4 py-3 text-right font-medium">Balance</th>
                  <th className="px-4 py-3 text-left font-medium">Due Date</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(a => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{a.student_name}</div>
                      <div className="text-xs text-gray-500">{a.student_no}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{a.term_name}</td>
                    <td className="px-4 py-3 text-right text-gray-900 text-xs">{a.total_amount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-green-700 text-xs">{a.paid_amount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-medium text-red-700 text-xs">{a.balance.toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{a.due_date ? new Date(a.due_date).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusBadge(a.status)}`}>{a.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 flex-wrap">
                        <button type="button"
                          onClick={() => { setPaymentModal(a); setPaymentError(''); setPaymentForm({ amount: '', payment_method: 'cash', reference_no: '', notes: '' }); }}
                          className="text-xs px-2 py-1 rounded bg-purple-100 hover:bg-purple-200 text-purple-700">Record</button>
                        <button type="button" onClick={() => loadPayments(a)}
                          className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">Statement</button>
                        <button type="button" onClick={() => openEditModal(a)}
                          className="text-xs px-2 py-1 rounded bg-blue-100 hover:bg-blue-200 text-blue-700">Edit</button>
                        <button type="button"
                          onClick={() => sendNotification(a)}
                          disabled={notifyLoading === a.id || a.balance <= 0}
                          title={a.balance <= 0 ? 'No outstanding balance' : 'Send payment reminder'}
                          className="text-xs px-2 py-1 rounded bg-amber-100 hover:bg-amber-200 text-amber-700 disabled:opacity-40 disabled:cursor-not-allowed">
                          {notifyLoading === a.id ? '…' : 'Notify'}
                        </button>
                        <button type="button"
                          onClick={() => { setDeleteTarget(a); setDeleteError(''); }}
                          disabled={a.paid_amount > 0}
                          title={a.paid_amount > 0 ? 'Cannot delete: payments recorded' : 'Delete'}
                          className="text-xs px-2 py-1 rounded bg-red-100 hover:bg-red-200 text-red-700 disabled:opacity-40 disabled:cursor-not-allowed">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Create Fee Accounts Modal ──────────────────────────────────────────── */}
      {createModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">Create Fee Accounts</h2>
              <button type="button" onClick={() => setCreateModal(false)} className="p-2 rounded hover:bg-gray-100"><XIcon /></button>
            </div>

            <div className="overflow-y-auto flex-1 p-6 space-y-5">
              {createError && <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{createError}</div>}

              {/* Row 1: Academic Year + Term */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
                  <select value={selYear} onChange={e => { setSelYear(e.target.value); setSelTermId(''); }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                    <option value="">All years</option>
                    {academicYears.map(y => <option key={y.label} value={y.label}>{y.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Academic Term *</label>
                  <select value={selTermId} onChange={e => setSelTermId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                    <option value="">Select term…</option>
                    {filteredTerms.map(t => (
                      <option key={t.id} value={t.id}>{t.name}{t.is_current ? ' (Current)' : ''}{!selYear ? ` · ${t.year_label}` : ''}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 2: Department + Program (filters the student list) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Department <span className="text-gray-400 font-normal text-xs">(filters student list)</span>
                  </label>
                  <select value={selDeptId} onChange={e => handleDeptChange(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                    <option value="">All departments</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Program <span className="text-gray-400 font-normal text-xs">(optional)</span>
                  </label>
                  <select value={selProgramId} onChange={e => setSelProgramId(e.target.value)}
                    disabled={programs.length === 0}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-50 disabled:text-gray-400">
                    <option value="">All programs</option>
                    {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Row 3: Amount + Due Date */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Total Fee Amount (ETB) *</label>
                  <input type="number" min="1" value={totalAmount} onChange={e => setTotalAmount(e.target.value)}
                    placeholder="e.g. 15000"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Due Date <span className="text-gray-400 font-normal text-xs">(optional)</span></label>
                  <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
              </div>

              {/* Student list */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Students</label>
                    {allStudents.length > 0 && (
                      <span className="ml-2 text-gray-400 font-normal text-xs">
                        {selectedStudents.size} selected · {visibleStudents.filter(r => r.has_account).length} already assigned
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {eligibleVisible.length > 0 && (
                      <button type="button" onClick={toggleAll} className="text-xs text-purple-700 hover:underline">
                        {allEligSelected ? 'Deselect all' : `Select all (${eligibleVisible.length})`}
                      </button>
                    )}
                  </div>
                </div>

                {!selTermId ? (
                  <div className="border border-dashed border-gray-200 rounded-lg p-6 text-center text-sm text-gray-400">
                    Select an academic term to load students
                  </div>
                ) : studentsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin w-6 h-6 rounded-full border-2 border-purple-200 border-t-purple-600" />
                  </div>
                ) : (
                  <>
                    {/* Student search */}
                    <div className="mb-2">
                      <input type="text" placeholder="Search students by name, number, or program…"
                        value={studentSearch} onChange={e => setStudentSearch(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                    </div>

                    {visibleStudents.length === 0 ? (
                      <div className="border border-dashed border-gray-200 rounded-lg p-5 text-center text-sm text-gray-400">
                        No students match the current filters.
                      </div>
                    ) : (
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="max-h-56 overflow-y-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-xs text-gray-500 uppercase sticky top-0">
                              <tr>
                                <th className="px-3 py-2 w-8"></th>
                                <th className="px-3 py-2 text-left">Student</th>
                                <th className="px-3 py-2 text-left">Program</th>
                                <th className="px-3 py-2 text-left">Fee Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {visibleStudents.map(s => (
                                <tr key={s.id} className={s.has_account ? 'bg-gray-50 opacity-60' : 'hover:bg-gray-50'}>
                                  <td className="px-3 py-2 text-center">
                                    <input type="checkbox" checked={selectedStudents.has(s.id)}
                                      disabled={s.has_account} onChange={() => toggleStudent(s.id)}
                                      className="rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
                                  </td>
                                  <td className="px-3 py-2">
                                    <p className="font-medium text-gray-900">{s.name}</p>
                                    <p className="text-xs text-gray-400">{s.student_no}</p>
                                  </td>
                                  <td className="px-3 py-2 text-gray-600 text-xs truncate max-w-[140px]">{s.program}</td>
                                  <td className="px-3 py-2 text-xs">
                                    {s.has_account
                                      ? <span className="text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">Already assigned</span>
                                      : <span className="text-gray-400">Not assigned</span>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Notification info */}
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <span>Each selected student will receive an in-app payment notification when fee accounts are created.</span>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0">
              <button type="button" onClick={handleCreateFeeAccounts}
                disabled={createLoading || selectedStudents.size === 0}
                className="flex-1 py-2.5 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
                {createLoading
                  ? 'Creating & Notifying…'
                  : selectedStudents.size === 0
                  ? 'Select students to continue'
                  : `Create & Notify ${selectedStudents.size} student${selectedStudents.size !== 1 ? 's' : ''}`}
              </button>
              <button type="button" onClick={() => setCreateModal(false)}
                className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Modal ─────────────────────────────────────────────────────────── */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Edit Fee Account</h2>
              <button type="button" onClick={() => setEditModal(null)} className="p-2 rounded hover:bg-gray-100"><XIcon /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <p className="text-gray-500">Student: <strong className="text-gray-900">{editModal.student_name}</strong></p>
                <p className="text-gray-500 mt-1">Already paid: <strong className="text-green-700">ETB {editModal.paid_amount.toLocaleString()}</strong></p>
              </div>
              {editError && <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{editError}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Total Fee Amount (ETB) *</label>
                <input type="number" min={editModal.paid_amount || 1} value={editTotalAmount}
                  onChange={e => setEditTotalAmount(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                {editTotalAmount && !isNaN(parseFloat(editTotalAmount)) && (
                  <p className="text-xs text-gray-500 mt-1">
                    New balance: <strong>ETB {Math.max(0, parseFloat(editTotalAmount) - editModal.paid_amount).toLocaleString()}</strong>
                    {' · '}Status: <strong>{deriveStatus(parseFloat(editTotalAmount), editModal.paid_amount)}</strong>
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                <input type="date" value={editDueDate} onChange={e => setEditDueDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={handleEdit} disabled={editLoading}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                  {editLoading ? 'Saving…' : 'Save Changes'}
                </button>
                <button type="button" onClick={() => setEditModal(null)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ─────────────────────────────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Delete Fee Account</h3>
                <p className="text-sm text-gray-500">{deleteTarget.student_name} · {deleteTarget.term_name}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600">This will permanently delete the <strong>ETB {deleteTarget.total_amount.toLocaleString()}</strong> fee account. This cannot be undone.</p>
            {deleteError && <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{deleteError}</div>}
            <div className="flex gap-3">
              <button type="button" onClick={handleDelete} disabled={deleteLoading}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                {deleteLoading ? 'Deleting…' : 'Delete'}
              </button>
              <button type="button" onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Record Payment Modal ───────────────────────────────────────────────── */}
      {paymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Record Payment</h2>
              <button type="button" onClick={() => setPaymentModal(null)} className="p-2 rounded hover:bg-gray-100"><XIcon /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-700">
                Student: <strong>{paymentModal.student_name}</strong> · Balance: <strong className="text-red-700">ETB {paymentModal.balance.toLocaleString()}</strong>
              </p>
              {paymentError && <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{paymentError}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (ETB) *</label>
                <input type="number" min="1" value={paymentForm.amount} onChange={e => setPaymentForm(p => ({ ...p, amount: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method *</label>
                <select value={paymentForm.payment_method} onChange={e => setPaymentForm(p => ({ ...p, payment_method: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                  {['cash','bank_transfer','online','scholarship','waiver','other'].map(m => (
                    <option key={m} value={m}>{m.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reference No</label>
                <input type="text" value={paymentForm.reference_no} onChange={e => setPaymentForm(p => ({ ...p, reference_no: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <input type="text" value={paymentForm.notes} onChange={e => setPaymentForm(p => ({ ...p, notes: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={handleRecordPayment} disabled={paymentLoading} className="flex-1 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                  {paymentLoading ? 'Processing…' : 'Record Payment'}
                </button>
                <button type="button" onClick={() => setPaymentModal(null)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Statement Modal ────────────────────────────────────────────────────── */}
      {statementsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Fee Statement</h2>
              <button type="button" onClick={() => setStatementsModal(null)} className="p-2 rounded hover:bg-gray-100"><XIcon /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-lg p-4 text-sm grid grid-cols-2 gap-2">
                <div><span className="text-gray-500">Student:</span> <strong>{statementsModal.student_name}</strong></div>
                <div><span className="text-gray-500">Term:</span> {statementsModal.term_name}</div>
                <div><span className="text-gray-500">Total:</span> ETB {statementsModal.total_amount.toLocaleString()}</div>
                <div><span className="text-gray-500">Paid:</span> ETB {statementsModal.paid_amount.toLocaleString()}</div>
                <div><span className="text-gray-500">Balance:</span> <strong className="text-red-700">ETB {statementsModal.balance.toLocaleString()}</strong></div>
                <div><span className="text-gray-500">Status:</span>
                  <span className={`ml-1 inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusBadge(statementsModal.status)}`}>{statementsModal.status}</span>
                </div>
              </div>
              <h3 className="font-semibold text-gray-900">Payment History</h3>
              {payments.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No payments recorded</p>
              ) : (
                <div className="space-y-2">
                  {payments.map(p => (
                    <div key={p.id} className="flex items-center justify-between bg-gray-50 rounded-lg p-3 text-sm">
                      <div>
                        <p className="font-medium text-gray-900">ETB {p.amount.toLocaleString()}</p>
                        <p className="text-gray-500 capitalize">{p.payment_method.replace('_', ' ')}{p.reference_no ? ` · Ref: ${p.reference_no}` : ''}</p>
                        {p.notes && <p className="text-gray-400 text-xs">{p.notes}</p>}
                      </div>
                      <p className="text-gray-500">{new Date(p.payment_date).toLocaleDateString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
