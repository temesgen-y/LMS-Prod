'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

interface Department {
  id: string;
  name: string;
}

interface AdvisorProfile {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  staffNo: string | null;
  specialization: string | null;
  maxAdvisees: number;
  departmentId: string | null;
  departmentName: string | null;
  profileStatus: string;
  createdAt: string;
}

export default function AdvisorProfilePage() {
  const supabase = createClient();
  const [profile, setProfile] = useState<AdvisorProfile | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ specialization: '', maxAdvisees: 30, departmentId: '' });

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: userData }, { data: deptData }] = await Promise.all([
        supabase.from('users')
          .select('id, first_name, last_name, email, academic_advisor_profiles!user_id(staff_no, specialization, max_advisees, department_id, profile_status, created_at)')
          .eq('auth_user_id', user.id)
          .single(),
        supabase.from('departments').select('id, name').order('name'),
      ]);

      setDepartments((deptData ?? []) as Department[]);

      if (!userData) { setLoading(false); return; }
      const u = userData as any;
      const p = Array.isArray(u.academic_advisor_profiles) ? u.academic_advisor_profiles[0] : u.academic_advisor_profiles;

      const profileData: AdvisorProfile = {
        userId: u.id,
        firstName: u.first_name ?? '',
        lastName: u.last_name ?? '',
        email: u.email ?? '',
        staffNo: p?.staff_no ?? null,
        specialization: p?.specialization ?? null,
        maxAdvisees: p?.max_advisees ?? 30,
        departmentId: p?.department_id ?? null,
        departmentName: null,
        profileStatus: p?.profile_status ?? 'active',
        createdAt: p?.created_at ?? '',
      };

      if (p?.department_id) {
        const dept = (deptData ?? []).find((d: any) => d.id === p.department_id);
        profileData.departmentName = (dept as any)?.name ?? null;
      }

      setProfile(profileData);
      setForm({
        specialization: p?.specialization ?? '',
        maxAdvisees: p?.max_advisees ?? 30,
        departmentId: p?.department_id ?? '',
      });
      setLoading(false);
    })();
  }, []);

  const saveProfile = async () => {
    if (!profile) return;
    setSaving(true);

    const updates: Record<string, any> = {
      specialization: form.specialization.trim() || null,
      max_advisees: form.maxAdvisees,
      department_id: form.departmentId || null,
    };

    const { error } = await supabase
      .from('academic_advisor_profiles')
      .update(updates)
      .eq('user_id', profile.userId);

    if (error) {
      toast.error(error.message);
      setSaving(false);
      return;
    }

    const deptName = departments.find(d => d.id === form.departmentId)?.name ?? null;
    setProfile(prev => prev ? {
      ...prev,
      specialization: form.specialization.trim() || null,
      maxAdvisees: form.maxAdvisees,
      departmentId: form.departmentId || null,
      departmentName: deptName,
    } : prev);
    toast.success('Profile updated');
    setEditing(false);
    setSaving(false);
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading…</div>;
  }

  if (!profile) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-400">Profile not found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <p className="text-sm text-gray-500 mt-0.5">Your academic advisor profile and settings</p>
      </div>

      {/* Profile card */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        <div className="bg-gradient-to-r from-teal-600 to-teal-700 px-6 py-8">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-white text-2xl font-bold">
              {profile.firstName[0]}{profile.lastName[0]}
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">{profile.firstName} {profile.lastName}</h2>
              <p className="text-teal-100 text-sm mt-0.5">{profile.email}</p>
              <span className="mt-1.5 inline-block px-2.5 py-0.5 bg-white/20 text-white text-xs font-medium rounded-full">
                Academic Advisor
              </span>
            </div>
          </div>
        </div>

        <div className="divide-y divide-gray-100">
          <div className="flex items-center justify-between px-5 py-3">
            <span className="text-sm text-gray-500">Staff No.</span>
            <span className="text-sm font-medium text-gray-900 font-mono">{profile.staffNo ?? '—'}</span>
          </div>
          <div className="flex items-center justify-between px-5 py-3">
            <span className="text-sm text-gray-500">Department</span>
            <span className="text-sm font-medium text-gray-900">{profile.departmentName ?? '—'}</span>
          </div>
          <div className="flex items-center justify-between px-5 py-3">
            <span className="text-sm text-gray-500">Specialization</span>
            <span className="text-sm font-medium text-gray-900">{profile.specialization ?? '—'}</span>
          </div>
          <div className="flex items-center justify-between px-5 py-3">
            <span className="text-sm text-gray-500">Max Advisees</span>
            <span className="text-sm font-medium text-gray-900">{profile.maxAdvisees}</span>
          </div>
          <div className="flex items-center justify-between px-5 py-3">
            <span className="text-sm text-gray-500">Status</span>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${profile.profileStatus === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {profile.profileStatus}
            </span>
          </div>
          {profile.createdAt && (
            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-sm text-gray-500">Account created</span>
              <span className="text-sm text-gray-600">{new Date(profile.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 bg-gray-50">
          <button onClick={() => setEditing(true)}
            className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors">
            Edit Profile
          </button>
        </div>
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-4">Edit Profile</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                <select
                  value={form.departmentId}
                  onChange={e => setForm(f => ({ ...f, departmentId: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">— No department —</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Specialization</label>
                <input
                  type="text"
                  value={form.specialization}
                  onChange={e => setForm(f => ({ ...f, specialization: e.target.value }))}
                  placeholder="e.g. Computer Science, Engineering…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Advisees</label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={form.maxAdvisees}
                  onChange={e => setForm(f => ({ ...f, maxAdvisees: Number(e.target.value) }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <p className="text-xs text-gray-400 mt-1">Maximum number of students you can advise at one time</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setEditing(false)} disabled={saving}
                className="px-4 py-2 rounded-lg border text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                Cancel
              </button>
              <button onClick={saveProfile} disabled={saving}
                className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-60">
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
