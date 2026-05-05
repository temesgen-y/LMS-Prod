'use client';

import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

type Advisor = {
  userId: string;
  profileId: string;
  fullName: string;
  email: string;
  staffNo: string;
  specialization: string;
  status: string;
  createdAt: string;
};

const PAGE_SIZE = 10;

const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'One number', test: (p: string) => /[0-9]/.test(p) },
  { label: 'One special character', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

const initialAddForm = { firstName: '', lastName: '', email: '', staffNo: '', specialization: '', password: '' };

export default function AdminStaffAdvisorsPage() {
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Add modal
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(initialAddForm);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState<{ email: string; password: string; name: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Edit modal
  const [editTarget, setEditTarget] = useState<Advisor | null>(null);
  const [editForm, setEditForm] = useState({ firstName: '', lastName: '', staffNo: '', specialization: '', status: 'active' });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState('');

  // Deactivate confirm
  const [deactivateTarget, setDeactivateTarget] = useState<Advisor | null>(null);
  const [deactivating, setDeactivating] = useState(false);


  const fetchAdvisors = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('users')
      .select(`
        id,
        first_name,
        last_name,
        email,
        created_at,
        academic_advisor_profiles (
          id,
          staff_no,
          specialization,
          profile_status
        )
      `)
      .eq('role', 'academic_advisor')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to load advisors.');
    } else {
      const rows: Advisor[] = (data ?? []).map((row: any) => {
        const profile = Array.isArray(row.academic_advisor_profiles)
          ? row.academic_advisor_profiles[0]
          : row.academic_advisor_profiles;
        return {
          userId: row.id,
          profileId: profile?.id ?? '',
          fullName: [row.first_name, row.last_name].filter(Boolean).join(' ') || '—',
          email: row.email ?? '—',
          staffNo: profile?.staff_no ?? '',
          specialization: profile?.specialization ?? '',
          status: profile?.profile_status ?? 'active',
          createdAt: row.created_at,
        };
      });
      setAdvisors(rows);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAdvisors(); }, [fetchAdvisors]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (addOpen && !addSubmitting) { setAddOpen(false); setAddSuccess(null); setShowPassword(false); }
      if (editTarget && !editSubmitting) setEditTarget(null);
      if (deactivateTarget && !deactivating) setDeactivateTarget(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [addOpen, addSubmitting, editTarget, editSubmitting, deactivateTarget, deactivating]);

  const openAdd = () => {
    setAddForm(initialAddForm);
    setAddError('');
    setAddSuccess(null);
    setShowPassword(false);
    setAddOpen(true);
  };

  const closeAdd = () => {
    if (addSubmitting) return;
    setAddOpen(false);
    setAddSuccess(null);
    setShowPassword(false);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    const firstName = addForm.firstName.trim();
    const lastName = addForm.lastName.trim();
    const email = addForm.email.trim().toLowerCase();
    if (!firstName) { setAddError('First name is required.'); return; }
    if (!lastName) { setAddError('Last name is required.'); return; }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAddError('A valid email address is required.'); return;
    }
    if (PASSWORD_RULES.some((r) => !r.test(addForm.password))) {
      setAddError('Password must meet all requirements below.'); return;
    }
    setAddSubmitting(true);
    try {
      const res = await fetch('/api/admin/staff/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password: addForm.password,
          first_name: firstName,
          last_name: lastName,
          role: 'academic_advisor',
          staff_no: addForm.staffNo.trim() || null,
          specialization: addForm.specialization.trim() || null,
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) { setAddError(result.error || 'Failed to create account.'); return; }
      setAddSuccess({ email, password: addForm.password, name: `${firstName} ${lastName}` });
      setTimeout(() => {
        setAddOpen(false);
        setAddSuccess(null);
        setShowPassword(false);
        setAddForm(initialAddForm);
        fetchAdvisors();
      }, 4000);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setAddSubmitting(false);
    }
  };

  const openEdit = (adv: Advisor) => {
    const parts = adv.fullName.split(' ');
    setEditForm({
      firstName: parts[0] ?? '',
      lastName: parts.slice(1).join(' ') ?? '',
      staffNo: adv.staffNo,
      specialization: adv.specialization,
      status: adv.status,
    });
    setEditError('');
    setEditTarget(adv);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setEditError('');
    const firstName = editForm.firstName.trim();
    const lastName = editForm.lastName.trim();
    if (!firstName || !lastName) { setEditError('First and last name are required.'); return; }
    setEditSubmitting(true);
    const supabase = createClient();
    try {
      const { error: userErr } = await supabase
        .from('users')
        .update({ first_name: firstName, last_name: lastName })
        .eq('id', editTarget.userId);
      if (userErr) { setEditError(userErr.message); return; }

      const { error: profileErr } = await supabase
        .from('academic_advisor_profiles')
        .update({
          staff_no: editForm.staffNo.trim() || null,
          specialization: editForm.specialization.trim() || null,
          profile_status: editForm.status,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', editTarget.userId);
      if (profileErr) { setEditError(profileErr.message); return; }

      toast.success('Advisor updated.');
      setEditTarget(null);
      fetchAdvisors();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    setDeactivating(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('academic_advisor_profiles')
      .update({ profile_status: 'inactive' })
      .eq('user_id', deactivateTarget.userId);
    setDeactivating(false);
    if (error) { toast.error(error.message); }
    else { toast.success(`${deactivateTarget.fullName} deactivated.`); setDeactivateTarget(null); fetchAdvisors(); }
  };

  const handleActivate = async (adv: Advisor) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('academic_advisor_profiles')
      .update({ profile_status: 'active' })
      .eq('user_id', adv.userId);
    if (error) { toast.error(error.message); }
    else { toast.success(`${adv.fullName} activated.`); fetchAdvisors(); }
  };

  const filtered = advisors.filter((a) =>
    a.fullName.toLowerCase().includes(search.toLowerCase()) ||
    a.email.toLowerCase().includes(search.toLowerCase()) ||
    a.staffNo.toLowerCase().includes(search.toLowerCase()) ||
    a.specialization.toLowerCase().includes(search.toLowerCase())
  );
  const totalCount = filtered.length;
  const start = (page - 1) * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, totalCount);
  const paginated = filtered.slice(start, end);
  const fmtDate = (ts: string) =>
    new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary';
  const closeIcon = (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center">
        <div className="relative flex-1 max-w-md">
          <input type="search" placeholder="Search advisors..."
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <button type="button" onClick={openAdd}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 shrink-0">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Advisor
        </button>
      </div>

      {/* ── Add Modal ── */}
      {addOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" aria-hidden onClick={closeAdd} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md max-h-[90vh] flex flex-col bg-white rounded-xl shadow-xl border border-gray-200"
            role="dialog" aria-modal="true">
            <div className="flex items-center justify-between shrink-0 p-6 pb-0">
              <h2 className="text-lg font-bold text-gray-900">Add Academic Advisor Account</h2>
              <button type="button" onClick={closeAdd} disabled={addSubmitting}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-50">{closeIcon}</button>
            </div>
            {addSuccess ? (
              <div className="flex flex-col items-center gap-4 p-6 text-center">
                <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                  <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Account created successfully!</p>
                  <p className="text-sm text-gray-500 mt-1">Share these credentials with {addSuccess.name}.</p>
                </div>
                <div className="w-full text-left space-y-3 bg-gray-50 rounded-lg p-4 text-sm">
                  <div>
                    <span className="text-gray-500 text-xs uppercase tracking-wide">Email</span>
                    <p className="font-medium text-gray-900 mt-0.5">{addSuccess.email}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs uppercase tracking-wide">Temporary Password</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="font-medium text-gray-900 flex-1 font-mono">{showPassword ? addSuccess.password : '••••••••••••'}</p>
                      <button type="button" onClick={() => setShowPassword((s) => !s)} className="text-xs text-primary hover:underline shrink-0">{showPassword ? 'Hide' : 'Show'}</button>
                      <button type="button" onClick={() => { navigator.clipboard.writeText(addSuccess.password); toast.success('Password copied!'); }} className="text-xs text-primary hover:underline shrink-0">Copy</button>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-400">Closes automatically in a few seconds.</p>
              </div>
            ) : (
              <form onSubmit={handleAdd} className="flex flex-col flex-1 min-h-0 p-6">
                <div className="space-y-4 overflow-y-auto pr-1 max-h-[60vh]">
                  {addError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2">{addError}</div>}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                      <input type="text" required value={addForm.firstName}
                        onChange={(e) => setAddForm((f) => ({ ...f, firstName: e.target.value }))} className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                      <input type="text" required value={addForm.lastName}
                        onChange={(e) => setAddForm((f) => ({ ...f, lastName: e.target.value }))} className={inputCls} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email Address *</label>
                    <input type="email" required value={addForm.email}
                      onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Staff Number <span className="text-gray-400 font-normal">(optional)</span></label>
                    <input type="text" value={addForm.staffNo}
                      onChange={(e) => setAddForm((f) => ({ ...f, staffNo: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Specialization <span className="text-gray-400 font-normal">(optional)</span></label>
                    <input type="text" placeholder="e.g. STEM, Humanities, Business" value={addForm.specialization}
                      onChange={(e) => setAddForm((f) => ({ ...f, specialization: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Temporary Password *</label>
                    <input type="password" required value={addForm.password}
                      onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))} className={inputCls} />
                    <p className="text-xs text-gray-500 mt-1">Share this with the advisor. They can change it after login.</p>
                    <ul className="mt-2 space-y-1">
                      {PASSWORD_RULES.map((rule) => {
                        const ok = rule.test(addForm.password);
                        return (
                          <li key={rule.label} className={`flex items-center gap-1.5 text-xs ${ok ? 'text-green-600' : 'text-gray-400'}`}>
                            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              {ok ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /> : <circle cx="12" cy="12" r="9" strokeWidth={2} />}
                            </svg>
                            {rule.label}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-4 mt-4 shrink-0 border-t border-gray-100">
                  <button type="button" onClick={closeAdd} disabled={addSubmitting}
                    className="px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 disabled:opacity-50">Cancel</button>
                  <button type="submit" disabled={addSubmitting || PASSWORD_RULES.some((r) => !r.test(addForm.password))}
                    className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 min-w-[140px]">
                    {addSubmitting ? 'Creating...' : 'Create Account'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </>
      )}

      {/* ── Edit Modal ── */}
      {editTarget && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" aria-hidden onClick={() => { if (!editSubmitting) setEditTarget(null); }} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md max-h-[90vh] flex flex-col bg-white rounded-xl shadow-xl border border-gray-200"
            role="dialog" aria-modal="true">
            <div className="flex items-center justify-between shrink-0 p-6 pb-0">
              <h2 className="text-lg font-bold text-gray-900">Edit Academic Advisor</h2>
              <button type="button" onClick={() => setEditTarget(null)} disabled={editSubmitting}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-50">{closeIcon}</button>
            </div>
            <form onSubmit={handleEdit} className="flex flex-col flex-1 min-h-0 p-6">
              <div className="space-y-4 overflow-y-auto pr-1 max-h-[60vh]">
                {editError && <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2">{editError}</div>}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                    <input type="text" required value={editForm.firstName}
                      onChange={(e) => setEditForm((f) => ({ ...f, firstName: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                    <input type="text" required value={editForm.lastName}
                      onChange={(e) => setEditForm((f) => ({ ...f, lastName: e.target.value }))} className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Staff Number</label>
                  <input type="text" value={editForm.staffNo}
                    onChange={(e) => setEditForm((f) => ({ ...f, staffNo: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Specialization</label>
                  <input type="text" value={editForm.specialization}
                    onChange={(e) => setEditForm((f) => ({ ...f, specialization: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select value={editForm.status}
                    onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))} className={inputCls}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4 mt-4 shrink-0 border-t border-gray-100">
                <button type="button" onClick={() => setEditTarget(null)} disabled={editSubmitting}
                  className="px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={editSubmitting}
                  className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 min-w-[110px]">
                  {editSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* ── Deactivate Confirm ── */}
      {deactivateTarget && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" aria-hidden onClick={() => { if (!deactivating) setDeactivateTarget(null); }} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-white rounded-xl shadow-xl border border-gray-200 p-6"
            role="dialog" aria-modal="true">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Deactivate {deactivateTarget.fullName}?</h2>
            <p className="text-sm text-gray-600 mb-6">They will not be able to access the system until reactivated.</p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setDeactivateTarget(null)} disabled={deactivating}
                className="px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={handleDeactivate} disabled={deactivating}
                className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50 min-w-[120px]">
                {deactivating ? 'Deactivating...' : 'Deactivate'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Table ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="px-5 py-16 text-center text-sm text-gray-500">Loading advisors...</div>
        ) : advisors.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <p className="text-gray-600 font-medium mb-1">No academic advisor accounts yet.</p>
            <p className="text-sm text-gray-400 mb-4">Create the first advisor account.</p>
            <button type="button" onClick={openAdd}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Advisor
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/80">
                    {['Name', 'Email', 'Staff No', 'Specialization', 'Status', 'Created', 'Actions'].map((h) => (
                      <th key={h} className="text-left text-sm font-semibold text-gray-700 px-5 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.length === 0 ? (
                    <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-gray-500">No advisors match your search.</td></tr>
                  ) : paginated.map((adv) => (
                    <tr key={adv.userId} className="border-b border-gray-100 hover:bg-gray-50/50">
                      <td className="px-5 py-3 text-sm font-medium text-gray-900">{adv.fullName}</td>
                      <td className="px-5 py-3 text-sm text-gray-600">{adv.email}</td>
                      <td className="px-5 py-3 text-sm text-gray-600">{adv.staffNo || '—'}</td>
                      <td className="px-5 py-3 text-sm text-gray-600">{adv.specialization || '—'}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          adv.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {adv.status.charAt(0).toUpperCase() + adv.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-500">{fmtDate(adv.createdAt)}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button type="button" onClick={() => openEdit(adv)}
                            className="px-3 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200">Edit</button>
                          {adv.status === 'active' ? (
                            <button type="button" onClick={() => setDeactivateTarget(adv)}
                              className="px-3 py-1 rounded text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100">Deactivate</button>
                          ) : (
                            <button type="button" onClick={() => handleActivate(adv)}
                              className="px-3 py-1 rounded text-xs font-medium bg-green-50 text-green-700 hover:bg-green-100">Activate</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col sm:flex-row justify-between items-center gap-3 px-5 py-3 border-t border-gray-200 bg-gray-50/50">
              <p className="text-sm text-gray-600">
                {totalCount === 0 ? 'No results' : `Showing ${start + 1}–${end} of ${totalCount}`}
              </p>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                  className="p-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <button type="button" onClick={() => setPage((p) => p + 1)} disabled={end >= totalCount}
                  className="p-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
