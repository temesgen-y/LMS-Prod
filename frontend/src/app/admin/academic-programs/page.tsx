'use client';

import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

type AcademicProgram = {
  id: string;
  name: string;
  code: string;
  degreeLevel: string;
  durationYears: number;
  departmentId: string;
  departmentName: string;
  isActive: boolean;
};

type DepartmentOption = {
  id: string;
  name: string;
};

const PAGE_SIZE = 10;

const DEGREE_LEVELS = ['certificate', 'diploma', 'bachelor', 'master', 'phd'];

const initialForm = {
  name: '',
  code: '',
  degreeLevel: 'bachelor',
  durationYears: '4',
  departmentId: '',
  isActive: true,
};

export default function AdminAcademicProgramsPage() {
  const [programs, setPrograms] = useState<AcademicProgram[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Add modal
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit modal
  const [editProgram, setEditProgram] = useState<AcademicProgram | null>(null);
  const [editForm, setEditForm] = useState(initialForm);
  const [editError, setEditError] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // View modal
  const [viewProgram, setViewProgram] = useState<AcademicProgram | null>(null);

  // Delete confirmation
  const [deleteProgram, setDeleteProgram] = useState<AcademicProgram | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchPrograms = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('academic_programs')
      .select(`
        id,
        name,
        code,
        degree_level,
        duration_years,
        is_active,
        department_id,
        departments!fk_academic_programs_department (
          name
        )
      `)
      .order('name', { ascending: true });

    if (error) {
      toast.error('Failed to load academic programs.');
    } else {
      setPrograms(
        (data ?? []).map((row: any) => ({
          id: row.id,
          name: row.name ?? '—',
          code: row.code ?? '—',
          degreeLevel: row.degree_level ?? '—',
          durationYears: row.duration_years ?? 0,
          departmentId: row.department_id ?? '',
          departmentName: row.departments?.name ?? '—',
          isActive: row.is_active ?? false,
        }))
      );
    }
    setLoading(false);
  }, []);

  const fetchDepartments = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('departments')
      .select('id, name')
      .eq('is_active', true)
      .order('name', { ascending: true });
    if (data) setDepartments(data.map((d: any) => ({ id: d.id, name: d.name })));
  }, []);

  useEffect(() => {
    fetchPrograms();
    fetchDepartments();
  }, [fetchPrograms, fetchDepartments]);

  // Close modals on Escape
  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (deleteProgram) { setDeleteProgram(null); return; }
        if (viewProgram) { setViewProgram(null); return; }
        if (editProgram && !isEditing) { setEditProgram(null); return; }
        if (modalOpen && !isSubmitting) { setModalOpen(false); return; }
      }
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [modalOpen, isSubmitting, editProgram, isEditing, viewProgram, deleteProgram]);

  // --- Add ---
  const openModal = useCallback(() => {
    setForm(initialForm);
    setSubmitError('');
    setModalOpen(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    const name = form.name.trim();
    const code = form.code.trim().toLowerCase();
    const duration = parseInt(form.durationYears, 10);
    if (!name) { setSubmitError('Program name is required.'); return; }
    if (!code) { setSubmitError('Program code is required.'); return; }
    if (!form.departmentId) { setSubmitError('Department is required.'); return; }
    if (!duration || duration < 1 || duration > 8) { setSubmitError('Duration must be between 1 and 8 years.'); return; }

    setIsSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.from('academic_programs').insert({
      name,
      code,
      degree_level: form.degreeLevel,
      duration_years: duration,
      department_id: form.departmentId,
      is_active: form.isActive,
    });

    if (error) {
      const msg = error.message ?? '';
      if (msg.includes('uq_academic_programs_code')) {
        setSubmitError('A program with this code already exists.');
      } else {
        setSubmitError(msg || 'Failed to create program.');
      }
      setIsSubmitting(false);
      return;
    }

    toast.success(`Program "${name}" created successfully.`);
    setModalOpen(false);
    setForm(initialForm);
    fetchPrograms();
    setIsSubmitting(false);
  };

  // --- Edit ---
  const openEdit = (prog: AcademicProgram) => {
    setEditProgram(prog);
    setEditForm({
      name: prog.name,
      code: prog.code,
      degreeLevel: prog.degreeLevel,
      durationYears: String(prog.durationYears),
      departmentId: prog.departmentId,
      isActive: prog.isActive,
    });
    setEditError('');
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editProgram) return;
    setEditError('');
    const name = editForm.name.trim();
    const code = editForm.code.trim().toLowerCase();
    const duration = parseInt(editForm.durationYears, 10);
    if (!name) { setEditError('Program name is required.'); return; }
    if (!code) { setEditError('Program code is required.'); return; }
    if (!editForm.departmentId) { setEditError('Department is required.'); return; }
    if (!duration || duration < 1 || duration > 8) { setEditError('Duration must be between 1 and 8 years.'); return; }

    setIsEditing(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('academic_programs')
      .update({
        name,
        code,
        degree_level: editForm.degreeLevel,
        duration_years: duration,
        department_id: editForm.departmentId,
        is_active: editForm.isActive,
      })
      .eq('id', editProgram.id);

    if (error) {
      const msg = error.message ?? '';
      if (msg.includes('uq_academic_programs_code')) {
        setEditError('A program with this code already exists.');
      } else {
        setEditError(msg || 'Failed to update program.');
      }
      setIsEditing(false);
      return;
    }

    toast.success(`Program "${name}" updated successfully.`);
    setEditProgram(null);
    fetchPrograms();
    setIsEditing(false);
  };

  // --- Delete ---
  const handleDelete = async () => {
    if (!deleteProgram) return;
    setIsDeleting(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('academic_programs')
      .delete()
      .eq('id', deleteProgram.id);

    if (error) {
      toast.error(error.message || 'Failed to delete program.');
      setIsDeleting(false);
      return;
    }

    toast.success(`Program "${deleteProgram.name}" deleted.`);
    setDeleteProgram(null);
    fetchPrograms();
    setIsDeleting(false);
  };

  const filtered = programs.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.code.toLowerCase().includes(search.toLowerCase()) ||
    p.degreeLevel.toLowerCase().includes(search.toLowerCase()) ||
    p.departmentName.toLowerCase().includes(search.toLowerCase())
  );

  const totalCount = filtered.length;
  const start = (page - 1) * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, totalCount);
  const paginated = filtered.slice(start, end);
  const canPrev = page > 1;
  const canNext = end < totalCount;

  return (
    <div className="space-y-6">
      {/* Search and action bar */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center">
        <div className="relative flex-1 max-w-md">
          <input
            type="search"
            placeholder="Search programs..."
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
          Add Program
        </button>
      </div>

      {/* Add Modal */}
      {modalOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" aria-hidden onClick={() => { if (!isSubmitting) setModalOpen(false); }} />
          <div
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md max-h-[90vh] flex flex-col bg-white rounded-xl shadow-xl border border-gray-200"
            role="dialog" aria-modal="true" aria-labelledby="add-program-title"
          >
            <div className="flex items-center justify-between shrink-0 p-6 pb-0">
              <h2 id="add-program-title" className="text-lg font-bold text-gray-900">Add Academic Program</h2>
              <button type="button" onClick={() => setModalOpen(false)} disabled={isSubmitting}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50" aria-label="Close"
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
                <ProgramFormFields form={form} setForm={setForm} departments={departments} />
              </div>
              <div className="flex justify-end gap-3 pt-4 mt-4 shrink-0 border-t border-gray-100">
                <button type="button" onClick={() => setModalOpen(false)} disabled={isSubmitting}
                  className="px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button type="submit" disabled={isSubmitting}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition disabled:opacity-50 min-w-[120px]"
                >
                  {isSubmitting ? 'Creating...' : 'Add Program'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Edit Modal */}
      {editProgram && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" aria-hidden onClick={() => { if (!isEditing) setEditProgram(null); }} />
          <div
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md max-h-[90vh] flex flex-col bg-white rounded-xl shadow-xl border border-gray-200"
            role="dialog" aria-modal="true" aria-labelledby="edit-program-title"
          >
            <div className="flex items-center justify-between shrink-0 p-6 pb-0">
              <h2 id="edit-program-title" className="text-lg font-bold text-gray-900">Edit Academic Program</h2>
              <button type="button" onClick={() => setEditProgram(null)} disabled={isEditing}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50" aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleEditSubmit} className="flex flex-col flex-1 min-h-0 p-6">
              <div className="space-y-4 overflow-y-auto pr-1">
                {editError && (
                  <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2">{editError}</div>
                )}
                <ProgramFormFields form={editForm} setForm={setEditForm} departments={departments} />
              </div>
              <div className="flex justify-end gap-3 pt-4 mt-4 shrink-0 border-t border-gray-100">
                <button type="button" onClick={() => setEditProgram(null)} disabled={isEditing}
                  className="px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button type="submit" disabled={isEditing}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition disabled:opacity-50 min-w-[120px]"
                >
                  {isEditing ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* View Modal */}
      {viewProgram && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" aria-hidden onClick={() => setViewProgram(null)} />
          <div
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-white rounded-xl shadow-xl border border-gray-200"
            role="dialog" aria-modal="true" aria-labelledby="view-program-title"
          >
            <div className="flex items-center justify-between p-6 pb-4 border-b border-gray-100">
              <h2 id="view-program-title" className="text-lg font-bold text-gray-900">Program Details</h2>
              <button type="button" onClick={() => setViewProgram(null)}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700" aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <DetailRow label="Name" value={viewProgram.name} />
              <DetailRow label="Code" value={viewProgram.code.toUpperCase()} />
              <DetailRow label="Department" value={viewProgram.departmentName} />
              <DetailRow label="Degree Level" value={viewProgram.degreeLevel.charAt(0).toUpperCase() + viewProgram.degreeLevel.slice(1)} />
              <DetailRow label="Duration" value={`${viewProgram.durationYears} year${viewProgram.durationYears !== 1 ? 's' : ''}`} />
              <DetailRow
                label="Status"
                value={
                  <span className={`text-sm font-medium ${viewProgram.isActive ? 'text-green-600' : 'text-gray-500'}`}>
                    {viewProgram.isActive ? 'Active' : 'Inactive'}
                  </span>
                }
              />
            </div>
            <div className="flex justify-end gap-3 px-6 pb-6">
              <button type="button" onClick={() => setViewProgram(null)}
                className="px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition"
              >
                Close
              </button>
              <button type="button" onClick={() => { setViewProgram(null); openEdit(viewProgram); }}
                className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition"
              >
                Edit
              </button>
            </div>
          </div>
        </>
      )}

      {/* Delete Confirmation Modal */}
      {deleteProgram && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" aria-hidden onClick={() => { if (!isDeleting) setDeleteProgram(null); }} />
          <div
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-white rounded-xl shadow-xl border border-gray-200 p-6"
            role="dialog" aria-modal="true"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Delete Program</h3>
                <p className="text-sm text-gray-500">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-gray-700 mb-6">
              Are you sure you want to delete <span className="font-semibold">"{deleteProgram.name}"</span>?
            </p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteProgram(null)} disabled={isDeleting}
                className="px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button type="button" onClick={handleDelete} disabled={isDeleting}
                className="px-4 py-2.5 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 transition disabled:opacity-50 min-w-[100px]"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/80">
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Name</th>
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Code</th>
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Department</th>
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Degree Level</th>
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Duration</th>
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Status</th>
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-gray-500">Loading programs...</td></tr>
              ) : paginated.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-gray-500">
                  {search ? 'No programs match your search.' : 'No academic programs found.'}
                </td></tr>
              ) : (
                paginated.map((prog) => (
                  <tr key={prog.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-5 py-3 text-sm font-medium text-gray-900">{prog.name}</td>
                    <td className="px-5 py-3 text-sm text-gray-600 uppercase">{prog.code}</td>
                    <td className="px-5 py-3 text-sm text-gray-600">{prog.departmentName}</td>
                    <td className="px-5 py-3 text-sm text-gray-600 capitalize">{prog.degreeLevel}</td>
                    <td className="px-5 py-3 text-sm text-gray-600">{prog.durationYears} yr{prog.durationYears !== 1 ? 's' : ''}</td>
                    <td className="px-5 py-3">
                      <span className={`text-sm font-medium ${prog.isActive ? 'text-green-600' : 'text-gray-500'}`}>
                        {prog.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setViewProgram(prog)}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900"
                          title="View"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(prog)}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900"
                          title="Edit"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteProgram(prog)}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-red-600"
                          title="Delete"
                        >
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
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={!canPrev}
              className="p-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none" aria-label="Previous page"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button type="button" onClick={() => setPage((p) => p + 1)} disabled={!canNext}
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

// Shared form fields for Add and Edit modals
function ProgramFormFields({
  form,
  setForm,
  departments,
}: {
  form: typeof initialForm;
  setForm: React.Dispatch<React.SetStateAction<typeof initialForm>>;
  departments: DepartmentOption[];
}) {
  return (
    <>
      <div>
        <label htmlFor="prog-name" className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
        <input id="prog-name" type="text" required value={form.name}
          placeholder="e.g. BSc Computer Science"
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </div>
      <div>
        <label htmlFor="prog-code" className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
        <input id="prog-code" type="text" required value={form.code}
          placeholder="e.g. bscs"
          onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </div>
      <div>
        <label htmlFor="prog-dept" className="block text-sm font-medium text-gray-700 mb-1">Department *</label>
        <select id="prog-dept" value={form.departmentId}
          onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value }))}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        >
          <option value="">— Select Department —</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="prog-degree" className="block text-sm font-medium text-gray-700 mb-1">Degree Level *</label>
        <select id="prog-degree" value={form.degreeLevel}
          onChange={(e) => setForm((f) => ({ ...f, degreeLevel: e.target.value }))}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        >
          {DEGREE_LEVELS.map((d) => (
            <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="prog-duration" className="block text-sm font-medium text-gray-700 mb-1">Duration (years) *</label>
        <input id="prog-duration" type="number" min={1} max={8} required value={form.durationYears}
          onChange={(e) => setForm((f) => ({ ...f, durationYears: e.target.value }))}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </div>
      <div className="flex items-center gap-3">
        <input id="prog-active" type="checkbox" checked={form.isActive}
          onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
          className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
        />
        <label htmlFor="prog-active" className="text-sm font-medium text-gray-700">Active</label>
      </div>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <span className="text-sm font-medium text-gray-500 w-28 shrink-0">{label}</span>
      <span className="text-sm text-gray-900">{value}</span>
    </div>
  );
}
