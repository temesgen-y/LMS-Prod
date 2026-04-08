'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

const PAGE_SIZE = 10;
const STATUSES = ['active', 'inactive'] as const;
type ProfileStatus = typeof STATUSES[number];

type AdminProfile = {
  id: string;
  user_id: string;
  profile_status: ProfileStatus;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  first_name: string;
  last_name: string;
  email: string;
  user_status: string;
};

export default function AdminProfilesPage() {
  const supabase = createClient();

  const [profiles, setProfiles] = useState<AdminProfile[]>([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminProfile | null>(null);
  const [editStatus, setEditStatus] = useState<ProfileStatus>('active');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('admin_profiles')
      .select(`
        id, user_id, profile_status, created_at, updated_at, created_by,
        users!fk_admin_profiles_user(first_name, last_name, email, status)
      `)
      .order('created_at', { ascending: false });

    if (error) { toast.error(error.message); setLoading(false); return; }

    setProfiles((data ?? []).map((r: any) => ({
      id: r.id,
      user_id: r.user_id,
      profile_status: r.profile_status,
      created_at: r.created_at,
      updated_at: r.updated_at,
      created_by: r.created_by,
      first_name: r.users?.first_name ?? '',
      last_name: r.users?.last_name ?? '',
      email: r.users?.email ?? '',
      user_status: r.users?.status ?? '',
    })));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, []);

  const openEdit = (p: AdminProfile) => {
    setEditing(p);
    setEditStatus(p.profile_status);
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    const { error } = await supabase
      .from('admin_profiles')
      .update({ profile_status: editStatus })
      .eq('id', editing.id);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success('Profile status updated');
    setSaving(false);
    setEditing(null);
    load();
  };

  const statusBadge = (s: ProfileStatus) =>
    s === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500';

  const userStatusBadge = (s: string) => {
    const map: Record<string, string> = {
      active: 'bg-green-100 text-green-700',
      inactive: 'bg-gray-100 text-gray-500',
      suspended: 'bg-red-100 text-red-600',
      pending: 'bg-amber-100 text-amber-700',
    };
    return map[s] ?? 'bg-gray-100 text-gray-600';
  };

  const filtered = profiles
    .filter(p => !filterStatus || p.profile_status === filterStatus)
    .filter(p => !search || `${p.first_name} ${p.last_name} ${p.email}`.toLowerCase().includes(search.toLowerCase()));

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Admin Profiles</h1>
        <span className="text-sm text-gray-500">{filtered.length} admin{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="search"
          placeholder="Search by name or email…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64"
        />
        <select
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
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
                  {['Admin', 'Email', 'Profile Status', 'Account Status', 'Created', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginated.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">No admin profiles found</td></tr>
                ) : paginated.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs">
                          {p.first_name[0]}{p.last_name[0]}
                        </div>
                        <span className="font-medium text-gray-900">{p.first_name} {p.last_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{p.email}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusBadge(p.profile_status)}`}>
                        {p.profile_status.charAt(0).toUpperCase() + p.profile_status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${userStatusBadge(p.user_status)}`}>
                        {p.user_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{new Date(p.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => openEdit(p)} className="text-blue-600 hover:underline text-xs font-medium">Edit Status</button>
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

      {/* Edit Status Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold mb-1">Edit Profile Status</h2>
            <p className="text-sm text-gray-500 mb-4">{editing.first_name} {editing.last_name}</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Profile Status</label>
              <select
                value={editStatus}
                onChange={e => setEditStatus(e.target.value as ProfileStatus)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg border text-sm">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-primary text-white rounded-lg text-sm disabled:opacity-60">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
