'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

type AdminProfile = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
};

function getInitials(first: string, last: string) {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase() || 'AD';
}

export default function AdminProfilePage() {
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { setLoading(false); return; }

      const { data } = await supabase
        .from('users')
        .select('id, first_name, last_name, email, role, status, created_at')
        .eq('auth_user_id', authData.user.id)
        .single();

      if (data) setProfile(data as AdminProfile);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-gray-400">Loading…</div>;
  }

  if (!profile) {
    return <div className="flex items-center justify-center py-20 text-gray-400">Profile not found.</div>;
  }

  const fullName = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || 'Admin';

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <p className="text-sm text-gray-500 mt-0.5">Your account information</p>
      </div>

      {/* Avatar + name card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-4">
        <div className="flex items-center gap-5">
          <div className="w-20 h-20 rounded-full bg-[#3d2c6d] flex items-center justify-center text-white text-2xl font-bold shrink-0">
            {getInitials(profile.first_name, profile.last_name)}
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">{fullName}</h2>
            <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs font-semibold capitalize">
              {profile.role}
            </span>
            <span className={`ml-2 inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
              profile.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}>
              {profile.status}
            </span>
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100 mb-4">
        <div className="px-6 py-4 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-500">Email</span>
          <span className="text-sm text-gray-900">{profile.email}</span>
        </div>
        <div className="px-6 py-4 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-500">First Name</span>
          <span className="text-sm text-gray-900">{profile.first_name || '—'}</span>
        </div>
        <div className="px-6 py-4 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-500">Last Name</span>
          <span className="text-sm text-gray-900">{profile.last_name || '—'}</span>
        </div>
        <div className="px-6 py-4 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-500">Role</span>
          <span className="text-sm text-gray-900 capitalize">{profile.role}</span>
        </div>
        <div className="px-6 py-4 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-500">Member Since</span>
          <span className="text-sm text-gray-900">
            {new Date(profile.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
        </div>
      </div>

      {/* Change Password */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Password</h3>
            <p className="text-xs text-gray-500 mt-0.5">Update your account password</p>
          </div>
          <Link
            href="/change-password"
            className="px-4 py-2 bg-[#3d2c6d] text-white rounded-lg text-sm font-medium hover:bg-[#2d1f55] transition-colors"
          >
            Change Password
          </Link>
        </div>
      </div>
    </div>
  );
}
