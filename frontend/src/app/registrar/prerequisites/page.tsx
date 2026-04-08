'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface Prerequisite {
  id: string;
  course_id: string;
  course_code: string;
  course_title: string;
  prerequisite_id: string;
  prereq_code: string;
  prereq_title: string;
  min_grade: string;
  prerequisite_type: string;
}

interface Course { id: string; code: string; title: string; }

export default function PrerequisitesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [prerequisites, setPrerequisites] = useState<Prerequisite[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    course_id: '',
    prerequisite_id: '',
    min_grade: 'D',
    prerequisite_type: 'hard',
  });
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { router.replace('/login'); return; }

      const [prereqRes, courseRes] = await Promise.all([
        supabase.from('course_prerequisites')
          .select(`
            id, course_id, prerequisite_id, min_grade, prerequisite_type,
            courses!course_id(code, title),
            prereq_courses:courses!prerequisite_course_id(code, title)
          `)
          .order('created_at', { ascending: false }),
        supabase.from('courses').select('id, code, title').order('code'),
      ]);

      setPrerequisites(((prereqRes.data ?? []) as any[]).map(p => ({
        id: p.id,
        course_id: p.course_id,
        course_code: p.courses?.code ?? '—',
        course_title: p.courses?.title ?? '—',
        prerequisite_id: p.prerequisite_id,
        prereq_code: p.prereq_courses?.code ?? '—',
        prereq_title: p.prereq_courses?.title ?? '—',
        min_grade: p.min_grade ?? 'D',
        prerequisite_type: p.prerequisite_type,
      })));

      setCourses((courseRes.data ?? []) as Course[]);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAdd = async () => {
    if (!formData.course_id || !formData.prerequisite_id) {
      setFormError('Please select both course and prerequisite.');
      return;
    }
    if (formData.course_id === formData.prerequisite_id) {
      setFormError('A course cannot be its own prerequisite.');
      return;
    }
    setFormLoading(true);
    setFormError('');
    try {
      const supabase = createClient();
      const { error: insertErr } = await supabase.from('course_prerequisites').insert({
        course_id: formData.course_id,
        prerequisite_id: formData.prerequisite_id,
        min_grade: formData.min_grade,
        prerequisite_type: formData.prerequisite_type,
      });
      if (insertErr) throw new Error(insertErr.message);
      setShowModal(false);
      setFormData({ course_id: '', prerequisite_id: '', min_grade: 'D', prerequisite_type: 'hard' });
      loadData();
    } catch (e: any) {
      setFormError(e.message ?? 'Failed to save');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this prerequisite?')) return;
    setDeleteLoading(id);
    try {
      const supabase = createClient();
      await supabase.from('course_prerequisites').delete().eq('id', id);
      loadData();
    } catch (e: any) {
      setError(e.message ?? 'Delete failed');
    } finally {
      setDeleteLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-700" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Course Prerequisites</h1>
        <button
          type="button"
          onClick={() => { setShowModal(true); setFormError(''); }}
          className="px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-sm font-medium"
        >
          + Add Prerequisite
        </button>
      </div>
      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">{error}</div>}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {prerequisites.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <p className="text-sm">No prerequisites configured</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">Course</th>
                  <th className="px-5 py-3 text-left font-medium">Requires</th>
                  <th className="px-5 py-3 text-left font-medium">Min Grade</th>
                  <th className="px-5 py-3 text-left font-medium">Type</th>
                  <th className="px-5 py-3 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {prerequisites.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <div className="font-medium text-gray-900">{p.course_code}</div>
                      <div className="text-xs text-gray-500">{p.course_title}</div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="font-medium text-gray-900">{p.prereq_code}</div>
                      <div className="text-xs text-gray-500">{p.prereq_title}</div>
                    </td>
                    <td className="px-5 py-3 font-medium text-gray-900">{p.min_grade}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                        p.prerequisite_type === 'hard' ? 'bg-red-100 text-red-800' :
                        p.prerequisite_type === 'soft' ? 'bg-yellow-100 text-yellow-800' :
                        p.prerequisite_type === 'corequisite' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {p.prerequisite_type}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <button
                        type="button"
                        onClick={() => handleDelete(p.id)}
                        disabled={deleteLoading === p.id}
                        className="text-xs px-2 py-1 rounded bg-red-100 hover:bg-red-200 text-red-700 disabled:opacity-50"
                      >
                        {deleteLoading === p.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Add Prerequisite</h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-2 rounded hover:bg-gray-100">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              {formError && <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{formError}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Course *</label>
                <select value={formData.course_id} onChange={e => setFormData(p => ({ ...p, course_id: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                  <option value="">Select course...</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prerequisite Course *</label>
                <select value={formData.prerequisite_id} onChange={e => setFormData(p => ({ ...p, prerequisite_id: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                  <option value="">Select prerequisite...</option>
                  {courses.filter(c => c.id !== formData.course_id).map(c => <option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Min Grade</label>
                  <select value={formData.min_grade} onChange={e => setFormData(p => ({ ...p, min_grade: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                    {['A', 'B', 'C', 'D', 'F'].map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select value={formData.prerequisite_type} onChange={e => setFormData(p => ({ ...p, prerequisite_type: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                    {['hard', 'soft', 'corequisite', 'antirequisite'].map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={handleAdd} disabled={formLoading} className="flex-1 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                  {formLoading ? 'Saving...' : 'Add Prerequisite'}
                </button>
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
