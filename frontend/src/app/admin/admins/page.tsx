'use client';

import { useEffect, useState } from 'react';

const PAGE_SIZE = 15;

type Admin = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  status: string;
  created_at: string;
  profile_status: string | null;
};

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    active:    'bg-green-100 text-green-700',
    inactive:  'bg-gray-100 text-gray-500',
    suspended: 'bg-red-100 text-red-600',
    pending:   'bg-amber-100 text-amber-700',
  };
  return map[s?.toLowerCase()] ?? 'bg-gray-100 text-gray-600';
};

export default function AdminsPage() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const load = async () => {
      const res = await fetch('/api/admin/admins');
      if (!res.ok) { setLoading(false); return; }
      const data = await res.json();
      setAdmins(
        (data as any[]).map(r => ({
          id: r.id,
          email: r.email,
          first_name: r.first_name,
          last_name: r.last_name,
          status: r.status,
          created_at: r.created_at,
          profile_status: r.admin_profiles?.profile_status ?? null,
        }))
      );
      setLoading(false);
    };
    load();
  }, []);

  const filtered = admins
    .filter(a => !filterStatus || a.status.toLowerCase() === filterStatus)
    .filter(a => {
      const q = search.toLowerCase();
      return !q || `${a.first_name} ${a.last_name}`.toLowerCase().includes(q) || a.email.toLowerCase().includes(q);
    });

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const counts = {
    total:    admins.length,
    active:   admins.filter(a => a.status.toLowerCase() === 'active').length,
    inactive: admins.filter(a => a.status.toLowerCase() === 'inactive').length,
    pending:  admins.filter(a => a.status.toLowerCase() === 'pending').length,
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Admins</h1>
        <p className="text-sm text-gray-500 mt-0.5">All administrator accounts</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total',    count: counts.total,    color: 'text-gray-700',   key: '' },
          { label: 'Active',   count: counts.active,   color: 'text-green-600',  key: 'active' },
          { label: 'Inactive', count: counts.inactive, color: 'text-gray-500',   key: 'inactive' },
          { label: 'Pending',  count: counts.pending,  color: 'text-amber-600',  key: 'pending' },
        ].map(c => (
          <button
            key={c.key}
            onClick={() => { setFilterStatus(filterStatus === c.key ? '' : c.key); setPage(1); }}
            className={`bg-white rounded-xl border p-4 text-left hover:shadow-sm transition ${filterStatus === c.key ? 'border-primary ring-1 ring-primary' : 'border-gray-200'}`}
          >
            <div className={`text-2xl font-bold ${c.color}`}>{c.count}</div>
            <div className="text-xs text-gray-500 mt-0.5">{c.label}</div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="search"
          placeholder="Search name or email…"
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
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading…</div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Admin', 'Email', 'Account Status', 'Profile Status', 'Created'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-gray-400">No admins found</td>
                  </tr>
                ) : paginated.map(a => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0">
                          {a.first_name?.[0]?.toUpperCase()}{a.last_name?.[0]?.toUpperCase()}
                        </div>
                        <span className="font-medium text-gray-900 whitespace-nowrap">
                          {a.first_name} {a.last_name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{a.email}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${statusBadge(a.status)}`}>
                        {a.status?.toLowerCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {a.profile_status ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${statusBadge(a.profile_status)}`}>
                          {a.profile_status.toLowerCase()}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs italic">No profile</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {new Date(a.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
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
    </div>
  );
}
