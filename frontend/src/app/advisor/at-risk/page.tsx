'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getGpaPoints } from '@/utils/gradeCalculator';
import Link from 'next/link';

interface RiskStudent {
  userId: string;
  name: string;
  email: string;
  studentNo: string;
  cumGpa: number | null;
  activeHolds: number;
  standing: string | null;
  riskLevel: 'high' | 'medium' | 'low';
  riskReasons: string[];
  upcomingAppointment: string | null;
}

const STANDING_COLORS: Record<string, string> = {
  "Dean's List": 'bg-green-100 text-green-700',
  'Good Standing': 'bg-blue-100 text-blue-700',
  'Academic Probation': 'bg-orange-100 text-orange-700',
  'Dismissal Warning': 'bg-red-100 text-red-700',
};

export default function AtRiskPage() {
  const [advisorId, setAdvisorId] = useState('');
  const [students, setStudents] = useState<RiskStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'high' | 'medium'>('all');

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: me } = await supabase.from('users').select('id').eq('auth_user_id', user.id).single();
      if (!me) return;
      const aid = (me as { id: string }).id;
      setAdvisorId(aid);

      // Get assigned students
      const { data: assignments } = await supabase
        .from('advisor_assignments')
        .select('student_id')
        .eq('advisor_id', aid)
        .eq('is_active', true);

      if (!assignments || assignments.length === 0) { setLoading(false); return; }
      const studentIds = (assignments as any[]).map(a => a.student_id);

      // Fetch users + profiles
      const { data: usersData } = await supabase
        .from('users')
        .select('id, first_name, last_name, email, student_profiles!user_id(student_no)')
        .in('id', studentIds);

      // Fetch enrollments to compute GPA
      const { data: enrollRows } = await supabase
        .from('enrollments')
        .select('student_id, final_grade, status, course_offerings!fk_enrollments_offering(courses(credit_hours))')
        .in('student_id', studentIds)
        .eq('status', 'completed');

      // GPA per student
      const gpaByStudent: Record<string, number | null> = {};
      const gpaData: Record<string, { pts: number; cred: number }> = {};
      ((enrollRows ?? []) as any[]).forEach(e => {
        if (!e.final_grade) return;
        const co = Array.isArray(e.course_offerings) ? e.course_offerings[0] : e.course_offerings;
        const course = Array.isArray(co?.courses) ? co.courses[0] : co?.courses;
        const credits = course?.credit_hours ?? 3;
        const pts = getGpaPoints(e.final_grade);
        if (!gpaData[e.student_id]) gpaData[e.student_id] = { pts: 0, cred: 0 };
        gpaData[e.student_id].pts += pts * credits;
        gpaData[e.student_id].cred += credits;
      });
      studentIds.forEach(sid => {
        const d = gpaData[sid];
        gpaByStudent[sid] = d && d.cred > 0 ? Math.round((d.pts / d.cred) * 100) / 100 : null;
      });

      // Fetch academic standing records (most recent per student)
      const { data: standingRows } = await supabase
        .from('academic_standing')
        .select('student_id, standing, gpa, cumulative_gpa')
        .in('student_id', studentIds)
        .order('created_at', { ascending: false });

      const standingByStudent: Record<string, string> = {};
      const seen = new Set<string>();
      ((standingRows ?? []) as any[]).forEach(s => {
        if (!seen.has(s.student_id)) { standingByStudent[s.student_id] = s.standing; seen.add(s.student_id); }
      });

      // Fetch active holds
      const { data: holdsData } = await supabase
        .from('student_holds')
        .select('student_id')
        .in('student_id', studentIds)
        .eq('is_active', true);

      const holdCounts: Record<string, number> = {};
      ((holdsData ?? []) as any[]).forEach(h => { holdCounts[h.student_id] = (holdCounts[h.student_id] ?? 0) + 1; });

      // Fetch upcoming appointments
      const now = new Date().toISOString();
      const { data: aptRows } = await supabase
        .from('advisor_appointments')
        .select('student_id, scheduled_at')
        .eq('advisor_id', aid)
        .eq('status', 'scheduled')
        .gte('scheduled_at', now)
        .order('scheduled_at', { ascending: true });

      const nextApt: Record<string, string> = {};
      ((aptRows ?? []) as any[]).forEach(a => { if (!nextApt[a.student_id]) nextApt[a.student_id] = a.scheduled_at; });

      const result: RiskStudent[] = ((usersData ?? []) as any[]).map(u => {
        const profile = Array.isArray(u.student_profiles) ? u.student_profiles[0] : u.student_profiles;
        const gpa = gpaByStudent[u.id];
        const holds = holdCounts[u.id] ?? 0;
        const standing = standingByStudent[u.id] ?? null;

        const reasons: string[] = [];
        if (gpa !== null && gpa < 2.0) reasons.push(`CGPA ${gpa.toFixed(2)} (below 2.00)`);
        else if (gpa !== null && gpa < 2.5) reasons.push(`CGPA ${gpa.toFixed(2)} (below 2.50)`);
        if (holds > 0) reasons.push(`${holds} active hold${holds !== 1 ? 's' : ''}`);
        if (standing === 'probation' || standing === 'Academic Probation') reasons.push('Academic probation');
        if (standing === 'suspension' || standing === 'dismissed' || standing === 'Dismissal Warning') reasons.push('Dismissal warning');

        let riskLevel: RiskStudent['riskLevel'] = 'low';
        if (
          (gpa !== null && gpa < 2.0) ||
          holds >= 2 ||
          standing === 'suspension' || standing === 'dismissed' || standing === 'Dismissal Warning'
        ) {
          riskLevel = 'high';
        } else if (
          (gpa !== null && gpa < 2.5) ||
          holds === 1 ||
          standing === 'probation' || standing === 'Academic Probation'
        ) {
          riskLevel = 'medium';
        }

        return {
          userId: u.id,
          name: `${u.first_name} ${u.last_name}`.trim(),
          email: u.email,
          studentNo: profile?.student_no ?? '—',
          cumGpa: gpa,
          activeHolds: holds,
          standing,
          riskLevel,
          riskReasons: reasons,
          upcomingAppointment: nextApt[u.id] ?? null,
        };
      });

      // Sort: high first, then medium, then low; within each level by GPA asc (worst first)
      result.sort((a, b) => {
        const rOrder = { high: 0, medium: 1, low: 2 };
        const diff = rOrder[a.riskLevel] - rOrder[b.riskLevel];
        if (diff !== 0) return diff;
        const ga = a.cumGpa ?? 999;
        const gb = b.cumGpa ?? 999;
        return ga - gb;
      });

      setStudents(result);
      setLoading(false);
    })();
  }, []);

  const filtered = filter === 'all' ? students : students.filter(s => s.riskLevel === filter);
  const highCount = students.filter(s => s.riskLevel === 'high').length;
  const medCount = students.filter(s => s.riskLevel === 'medium').length;

  const riskBadge = (level: RiskStudent['riskLevel']) => {
    if (level === 'high') return 'bg-red-100 text-red-700 border-red-200';
    if (level === 'medium') return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-green-100 text-green-700 border-green-200';
  };

  const riskLabel = (level: RiskStudent['riskLevel']) =>
    level === 'high' ? 'High Risk' : level === 'medium' ? 'Medium Risk' : 'Good Standing';

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">At-Risk Students</h1>
        <p className="text-sm text-gray-500 mt-0.5">Advisees who need immediate attention based on GPA, holds, and standing</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <button onClick={() => setFilter('all')}
          className={`bg-white rounded-xl border p-5 text-left hover:shadow-sm transition ${filter === 'all' ? 'border-teal-500 ring-1 ring-teal-500' : 'border-gray-200'}`}>
          <div className="text-3xl font-bold text-gray-800">{students.length}</div>
          <div className="text-sm text-gray-500 mt-0.5">Total Advisees</div>
        </button>
        <button onClick={() => setFilter(filter === 'high' ? 'all' : 'high')}
          className={`bg-white rounded-xl border p-5 text-left hover:shadow-sm transition ${filter === 'high' ? 'border-teal-500 ring-1 ring-teal-500' : 'border-gray-200'}`}>
          <div className="text-3xl font-bold text-red-600">{highCount}</div>
          <div className="text-sm text-gray-500 mt-0.5">High Risk</div>
        </button>
        <button onClick={() => setFilter(filter === 'medium' ? 'all' : 'medium')}
          className={`bg-white rounded-xl border p-5 text-left hover:shadow-sm transition ${filter === 'medium' ? 'border-teal-500 ring-1 ring-teal-500' : 'border-gray-200'}`}>
          <div className="text-3xl font-bold text-amber-600">{medCount}</div>
          <div className="text-sm text-gray-500 mt-0.5">Medium Risk</div>
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-gray-500 font-medium">
            {filter === 'all' ? 'No students assigned to you yet' : `No ${filter} risk students found`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(s => (
            <div key={s.userId} className={`bg-white rounded-xl border p-5 ${s.riskLevel === 'high' ? 'border-red-200' : s.riskLevel === 'medium' ? 'border-amber-200' : 'border-gray-200'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${riskBadge(s.riskLevel)}`}>
                      {riskLabel(s.riskLevel)}
                    </span>
                    {s.activeHolds > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700">
                        {s.activeHolds} Hold{s.activeHolds !== 1 ? 's' : ''}
                      </span>
                    )}
                    {s.standing && STANDING_COLORS[s.standing] && (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STANDING_COLORS[s.standing]}`}>{s.standing}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Link href={`/advisor/students/${s.userId}`}
                      className="font-semibold text-gray-900 hover:text-teal-700 text-sm">{s.name}</Link>
                    <span className="text-xs text-gray-400 font-mono">{s.studentNo}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{s.email}</p>

                  {s.riskReasons.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {s.riskReasons.map((r, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{r}</span>
                      ))}
                    </div>
                  )}

                  {s.upcomingAppointment && (
                    <p className="text-xs text-teal-600 mt-1.5">
                      Next appointment: {new Date(s.upcomingAppointment).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2 shrink-0">
                  <div className="text-right">
                    <div className={`text-xl font-bold ${s.cumGpa !== null ? (s.cumGpa < 2.0 ? 'text-red-600' : s.cumGpa < 2.5 ? 'text-amber-600' : 'text-green-700') : 'text-gray-400'}`}>
                      {s.cumGpa !== null ? s.cumGpa.toFixed(2) : '—'}
                    </div>
                    <div className="text-xs text-gray-400">CGPA / 4.00</div>
                  </div>
                  <Link href={`/advisor/students/${s.userId}`}
                    className="px-3 py-1.5 bg-teal-100 text-teal-700 rounded-lg text-xs font-medium hover:bg-teal-200 transition-colors">
                    View Profile →
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
