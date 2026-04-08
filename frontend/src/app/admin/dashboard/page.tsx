'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Counts = {
  students: number;
  instructors: number;
  admins: number;
  courses: number;
  enrollments_active: number;
  enrollments_completed: number;
  enrollments_dropped: number;
  enrollments_failed: number;
  certificates_total: number;
  certificates_active: number;
  certificates_revoked: number;
  admin_profiles_total: number;
  admin_profiles_active: number;
  admin_profiles_inactive: number;
};

const EMPTY: Counts = {
  students: 0, instructors: 0, admins: 0, courses: 0,
  enrollments_active: 0, enrollments_completed: 0, enrollments_dropped: 0, enrollments_failed: 0,
  certificates_total: 0, certificates_active: 0, certificates_revoked: 0,
  admin_profiles_total: 0, admin_profiles_active: 0, admin_profiles_inactive: 0,
};

export default function AdminDashboardPage() {
  const [counts, setCounts] = useState<Counts>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [institutionName, setInstitutionName] = useState('MULE LMS');

  useEffect(() => {
    const load = async () => {
      const res = await fetch('/api/admin/dashboard-stats');
      if (!res.ok) { setLoading(false); return; }
      const data = await res.json();
      setCounts({
        students:                data.students,
        instructors:             data.instructors,
        admins:                  data.admins,
        courses:                 data.courses,
        enrollments_active:      data.enrollments_active,
        enrollments_completed:   data.enrollments_completed,
        enrollments_dropped:     data.enrollments_dropped,
        enrollments_failed:      data.enrollments_failed,
        certificates_total:      data.certificates_total,
        certificates_active:     data.certificates_active,
        certificates_revoked:    data.certificates_revoked,
        admin_profiles_total:    data.admin_profiles_total,
        admin_profiles_active:   data.admin_profiles_active,
        admin_profiles_inactive: data.admin_profiles_inactive,
      });
      if (data.institution_name) setInstitutionName(data.institution_name);
      setLoading(false);
    };
    load();
  }, []);

  const skeleton = 'animate-pulse bg-gray-200 rounded h-7 w-16';

  return (
    <div className="space-y-6">

      {/* Welcome */}
      <div className="bg-gradient-to-r from-primary to-primary/80 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-bold">{institutionName} — Admin Dashboard</h2>
            <p className="text-white/75 text-sm mt-0.5">Full overview of your institution</p>
          </div>
          <Link
            href="/admin/institution-settings"
            className="px-4 py-2 bg-white/15 hover:bg-white/25 rounded-lg text-sm font-medium transition"
          >
            Institution Settings
          </Link>
        </div>
      </div>

      {/* People & Courses */}
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">People &amp; Courses</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Students', value: counts.students, href: '/admin/students', color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Instructors', value: counts.instructors, href: '/admin/instructors', color: 'text-purple-600', bg: 'bg-purple-50' },
            { label: 'Admins', value: counts.admins, href: '/admin/admin-profiles', color: 'text-indigo-600', bg: 'bg-indigo-50' },
            { label: 'Courses', value: counts.courses, href: '/admin/courses', color: 'text-emerald-600', bg: 'bg-emerald-50' },
          ].map(c => (
            <Link key={c.label} href={c.href} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition group">
              <div className={`w-10 h-10 rounded-lg ${c.bg} flex items-center justify-center mb-3`}>
                <span className={`text-lg font-bold ${c.color}`}>{loading ? '–' : c.value}</span>
              </div>
              <div className="text-sm font-medium text-gray-700 group-hover:text-primary transition">{c.label}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* Enrollments */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Enrollments</h3>
          <Link href="/admin/enrollments" className="text-xs text-primary font-medium hover:underline">Manage →</Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Active', value: counts.enrollments_active, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100' },
            { label: 'Completed', value: counts.enrollments_completed, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
            { label: 'Dropped', value: counts.enrollments_dropped, color: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-100' },
            { label: 'Failed', value: counts.enrollments_failed, color: 'text-red-500', bg: 'bg-red-50', border: 'border-red-100' },
          ].map(c => (
            <div key={c.label} className={`bg-white rounded-xl border ${c.border} p-5`}>
              <div className={`text-2xl font-bold ${c.color}`}>
                {loading ? <span className={skeleton} /> : c.value}
              </div>
              <div className="text-sm text-gray-500 mt-1">{c.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Certificates + Admin Profiles */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Certificates */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900">Certificates</h3>
            </div>
            <Link href="/admin/certificates" className="text-xs text-primary font-medium hover:underline">Manage →</Link>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className={`text-2xl font-bold text-gray-900 ${loading ? skeleton : ''}`}>{loading ? '' : counts.certificates_total}</div>
              <div className="text-xs text-gray-500 mt-0.5">Total</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl font-bold text-green-600 ${loading ? skeleton : ''}`}>{loading ? '' : counts.certificates_active}</div>
              <div className="text-xs text-gray-500 mt-0.5">Active</div>
            </div>
            <div className="text-center">
              <div className={`text-2xl font-bold text-red-500 ${loading ? skeleton : ''}`}>{loading ? '' : counts.certificates_revoked}</div>
              <div className="text-xs text-gray-500 mt-0.5">Revoked</div>
            </div>
          </div>
          <Link
            href="/admin/certificates"
            className="mt-4 flex items-center justify-center gap-1 w-full py-2 rounded-lg border border-dashed border-amber-300 text-amber-700 text-sm hover:bg-amber-50 transition"
          >
            + Issue Certificate
          </Link>
        </div>

        {/* Admin Profiles */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900">Admin Profiles</h3>
            </div>
            <Link href="/admin/admin-profiles" className="text-xs text-primary font-medium hover:underline">Manage →</Link>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">{loading ? '–' : counts.admin_profiles_total}</div>
              <div className="text-xs text-gray-500 mt-0.5">Total</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{loading ? '–' : counts.admin_profiles_active}</div>
              <div className="text-xs text-gray-500 mt-0.5">Active</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-400">{loading ? '–' : counts.admin_profiles_inactive}</div>
              <div className="text-xs text-gray-500 mt-0.5">Inactive</div>
            </div>
          </div>
          <Link
            href="/admin/admin-profiles"
            className="mt-4 flex items-center justify-center gap-1 w-full py-2 rounded-lg border border-dashed border-indigo-300 text-indigo-700 text-sm hover:bg-indigo-50 transition"
          >
            View Admin Profiles
          </Link>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Enroll Student', href: '/admin/enrollments', icon: 'M12 4v16m8-8H4', primary: true },
            { label: 'Issue Certificate', href: '/admin/certificates', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', primary: true },
            { label: 'Add Instructor', href: '/admin/instructors', icon: 'M12 4v16m8-8H4', primary: false },
            { label: 'Create Course', href: '/admin/courses', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253', primary: false },
            { label: 'Institution Settings', href: '/admin/institution-settings', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', primary: false },
            { label: 'View Enrollments', href: '/admin/enrollments', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', primary: false },
            { label: 'Admin Profiles', href: '/admin/admin-profiles', icon: 'M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0z', primary: false },
            { label: 'View Reports', href: '/admin/reports', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', primary: false },
          ].map(a => (
            <Link
              key={a.label}
              href={a.href}
              className={`flex items-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition ${
                a.primary
                  ? 'bg-primary text-white hover:bg-primary/90'
                  : 'border border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={a.icon} />
              </svg>
              <span className="truncate">{a.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
