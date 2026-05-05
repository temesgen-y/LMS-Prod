'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

interface Advisor {
  userId: string;
  name: string;
  email: string;
  specialization: string;
}

interface AssignedStudent {
  assignmentId: string;
  userId: string;
  name: string;
  studentNo: string;
}

interface StudentOption {
  id: string;
  name: string;
  studentNo: string;
}

export default function AdvisorAssignmentsPage() {
  const supabase = createClient();
  const [adminUserId, setAdminUserId] = useState('');
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [selectedAdvisor, setSelectedAdvisor] = useState<Advisor | null>(null);
  const [assignedStudents, setAssignedStudents] = useState<AssignedStudent[]>([]);
  const [allStudents, setAllStudents] = useState<StudentOption[]>([]);
  const [pickStudent, setPickStudent] = useState('');
  const [advisorsLoading, setAdvisorsLoading] = useState(true);
  const [assignedLoading, setAssignedLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [unassigningId, setUnassigningId] = useState<string | null>(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<AssignedStudent | null>(null);

  // Load admin user id + advisors + all active students once
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: me } = await supabase.from('users').select('id').eq('auth_user_id', user.id).single();
      if (me) setAdminUserId((me as { id: string }).id);

      const { data: advisorRows } = await supabase
        .from('users')
        .select('id, first_name, last_name, email, academic_advisor_profiles(specialization, profile_status)')
        .eq('role', 'academic_advisor')
        .order('first_name', { ascending: true });

      setAdvisors(
        ((advisorRows ?? []) as any[]).map(r => {
          const profile = Array.isArray(r.academic_advisor_profiles) ? r.academic_advisor_profiles[0] : r.academic_advisor_profiles;
          return {
            userId: r.id,
            name: `${r.first_name} ${r.last_name}`.trim(),
            email: r.email,
            specialization: profile?.specialization ?? '',
          };
        })
      );
      setAdvisorsLoading(false);

      const { data: studentRows } = await supabase
        .from('users')
        .select('id, first_name, last_name, student_profiles!user_id(student_no)')
        .in('role', ['student', 'STUDENT'])
        .in('status', ['active', 'ACTIVE'])
        .order('last_name', { ascending: true });

      setAllStudents(
        ((studentRows ?? []) as any[]).map(r => {
          const profile = Array.isArray(r.student_profiles) ? r.student_profiles[0] : r.student_profiles;
          return { id: r.id, name: `${r.first_name} ${r.last_name}`.trim(), studentNo: profile?.student_no ?? '' };
        })
      );
    };
    init();
  }, []);

  const loadAssigned = useCallback(async (advisorId: string) => {
    setAssignedLoading(true);
    const { data } = await supabase
      .from('advisor_assignments')
      .select('id, student_id, users!fk_aa_student(first_name, last_name, student_profiles!user_id(student_no))')
      .eq('advisor_id', advisorId)
      .eq('is_active', true);

    setAssignedStudents(
      ((data ?? []) as any[]).map(r => {
        const profile = Array.isArray(r.users?.student_profiles) ? r.users.student_profiles[0] : r.users?.student_profiles;
        return {
          assignmentId: r.id,
          userId: r.student_id,
          name: r.users ? `${r.users.first_name} ${r.users.last_name}`.trim() : '—',
          studentNo: profile?.student_no ?? '—',
        };
      })
    );
    setAssignedLoading(false);
  }, []);

  const selectAdvisor = (adv: Advisor) => {
    setSelectedAdvisor(adv);
    setPickStudent('');
    setStudentSearch('');
    loadAssigned(adv.userId);
  };

  const assignStudent = async () => {
    if (!pickStudent || !selectedAdvisor) return;
    setAssigning(true);
    const { error } = await supabase.from('advisor_assignments').upsert({
      advisor_id: selectedAdvisor.userId,
      student_id: pickStudent,
      assigned_by: adminUserId,
      is_active: true,
    }, { onConflict: 'advisor_id,student_id' });
    if (error) { toast.error(error.message); }
    else { toast.success('Student assigned'); setPickStudent(''); loadAssigned(selectedAdvisor.userId); }
    setAssigning(false);
  };

  const unassignStudent = async (s: AssignedStudent) => {
    setUnassigningId(s.assignmentId);
    const { error } = await supabase.from('advisor_assignments')
      .update({ is_active: false })
      .eq('id', s.assignmentId);
    if (error) { toast.error(error.message); }
    else { toast.success('Student removed'); if (selectedAdvisor) loadAssigned(selectedAdvisor.userId); }
    setUnassigningId(null);
    setConfirmRemove(null);
  };

  const unassignedStudents = allStudents.filter(s => !assignedStudents.some(a => a.userId === s.id));

  const filteredAssigned = assignedStudents.filter(s =>
    !studentSearch || `${s.name} ${s.studentNo}`.toLowerCase().includes(studentSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Advisor Assignments</h1>
        <p className="text-sm text-gray-500 mt-1">Select an advisor to manage which students are assigned to them</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Advisor list ── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-700">Academic Advisors</h2>
            <p className="text-xs text-gray-400 mt-0.5">{advisors.length} advisor{advisors.length !== 1 ? 's' : ''}</p>
          </div>
          {advisorsLoading ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">Loading…</div>
          ) : advisors.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">No advisors found</div>
          ) : (
            <div className="divide-y divide-gray-50 max-h-[calc(100vh-280px)] overflow-y-auto">
              {advisors.map(adv => {
                const isSelected = selectedAdvisor?.userId === adv.userId;
                return (
                  <button key={adv.userId} type="button" onClick={() => selectAdvisor(adv)}
                    className={`w-full text-left px-4 py-3 transition-colors ${isSelected ? 'bg-primary/10 border-l-4 border-primary' : 'hover:bg-gray-50 border-l-4 border-transparent'}`}>
                    <p className={`text-sm font-medium ${isSelected ? 'text-primary' : 'text-gray-900'}`}>{adv.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{adv.email}</p>
                    {adv.specialization && (
                      <p className="text-xs text-gray-400 mt-0.5">{adv.specialization}</p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Assignment panel ── */}
        <div className="lg:col-span-2 space-y-4">
          {!selectedAdvisor ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-300 flex items-center justify-center h-64">
              <p className="text-gray-400 text-sm">Select an advisor to manage assignments</p>
            </div>
          ) : (
            <>
              {/* Advisor header */}
              <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{selectedAdvisor.name}</h2>
                    <p className="text-sm text-gray-500">{selectedAdvisor.email}{selectedAdvisor.specialization ? ` · ${selectedAdvisor.specialization}` : ''}</p>
                  </div>
                  <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-medium">
                    {assignedStudents.length} assigned
                  </span>
                </div>
              </div>

              {/* Assign new student */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Assign Student</h3>
                <div className="flex gap-2">
                  <select value={pickStudent} onChange={e => setPickStudent(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary">
                    <option value="">Select a student…</option>
                    {unassignedStudents.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name}{s.studentNo ? ` — ${s.studentNo}` : ''}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={assignStudent} disabled={!pickStudent || assigning}
                    className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 shrink-0">
                    {assigning ? 'Assigning…' : 'Assign'}
                  </button>
                </div>
                {unassignedStudents.length === 0 && (
                  <p className="text-xs text-gray-400 mt-2">All active students are already assigned to this advisor.</p>
                )}
              </div>

              {/* Assigned students */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
                  <h3 className="text-sm font-semibold text-gray-700">Assigned Students</h3>
                  <input
                    type="search"
                    placeholder="Search…"
                    value={studentSearch}
                    onChange={e => setStudentSearch(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs w-44"
                  />
                </div>

                {assignedLoading ? (
                  <div className="px-5 py-8 text-center text-sm text-gray-400">Loading…</div>
                ) : filteredAssigned.length === 0 ? (
                  <div className="px-5 py-8 text-center text-sm text-gray-400">
                    {assignedStudents.length === 0 ? 'No students assigned yet' : 'No students match your search'}
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
                    {filteredAssigned.map(s => (
                      <div key={s.assignmentId} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{s.name}</p>
                          {s.studentNo !== '—' && <p className="text-xs text-gray-500">{s.studentNo}</p>}
                        </div>
                        <button type="button" onClick={() => setConfirmRemove(s)}
                          disabled={unassigningId === s.assignmentId}
                          className="px-3 py-1 rounded text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors">
                          {unassigningId === s.assignmentId ? 'Removing…' : 'Remove'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Confirm remove modal */}
      {confirmRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Remove Assignment?</h2>
            <p className="text-sm text-gray-600 mb-4">
              Remove <strong>{confirmRemove.name}</strong> from{' '}
              <strong>{selectedAdvisor?.name}</strong>?
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmRemove(null)} className="px-4 py-2 rounded-lg border text-sm text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={() => unassignStudent(confirmRemove)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
