'use client';

import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

type Attachment = {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  sizeKb: number | null;
  createdAt: string;
};

const PAGE_SIZE = 10;

const MIME_PRESETS = [
  { label: 'PDF', value: 'application/pdf' },
  { label: 'Word (.docx)', value: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { label: 'Excel (.xlsx)', value: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  { label: 'PowerPoint (.pptx)', value: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  { label: 'Image (JPEG)', value: 'image/jpeg' },
  { label: 'Image (PNG)', value: 'image/png' },
  { label: 'Video (MP4)', value: 'video/mp4' },
  { label: 'Audio (MP3)', value: 'audio/mpeg' },
  { label: 'ZIP archive', value: 'application/zip' },
  { label: 'Plain text', value: 'text/plain' },
  { label: 'Other (custom)', value: '__custom__' },
];

const MIME_ICON: Record<string, string> = {
  'application/pdf': '📄',
  'image/jpeg': '🖼️',
  'image/png': '🖼️',
  'video/mp4': '🎬',
  'audio/mpeg': '🎵',
  'application/zip': '🗜️',
  'text/plain': '📝',
};
function mimeIcon(mime: string) {
  if (mime.startsWith('image/')) return '🖼️';
  if (mime.startsWith('video/')) return '🎬';
  if (mime.startsWith('audio/')) return '🎵';
  return MIME_ICON[mime] ?? '📎';
}

const initialForm = {
  fileName: '',
  fileUrl: '',
  mimePreset: 'application/pdf',
  mimeCustom: '',
  sizeKb: '',
};

export default function InstructorAttachmentsPage() {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ─── Get current user's app id ────────────────────────────────────
  const getCurrentUserId = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();
    return data?.id ?? null;
  }, []);

  // ─── Fetch attachments uploaded by this instructor ─────────────────
  const fetchAttachments = useCallback(async () => {
    setLoading(true);
    const userId = await getCurrentUserId();
    if (!userId) { setLoading(false); return; }

    const supabase = createClient();
    const { data, error } = await supabase
      .from('attachments')
      .select('id, file_name, file_url, mime_type, size_kb, created_at')
      .eq('uploaded_by', userId)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to load attachments.');
    } else {
      setAttachments(
        (data ?? []).map((r: any) => ({
          id: r.id,
          fileName: r.file_name ?? '',
          fileUrl: r.file_url ?? '',
          mimeType: r.mime_type ?? '',
          sizeKb: r.size_kb ?? null,
          createdAt: r.created_at ? new Date(r.created_at).toLocaleDateString() : '—',
        }))
      );
    }
    setLoading(false);
  }, [getCurrentUserId]);

  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  // ─── Derived mime value from form ─────────────────────────────────
  const resolvedMime = (f: typeof form) =>
    f.mimePreset === '__custom__' ? f.mimeCustom.trim() : f.mimePreset;

  // ─── Modal helpers ─────────────────────────────────────────────────
  const openAddModal = useCallback(() => {
    setEditingId(null);
    setForm(initialForm);
    setSubmitError('');
    setModalOpen(true);
  }, []);

  const openEditModal = useCallback((a: Attachment) => {
    setEditingId(a.id);
    const preset = MIME_PRESETS.find((p) => p.value === a.mimeType && p.value !== '__custom__');
    setForm({
      fileName: a.fileName,
      fileUrl: a.fileUrl,
      mimePreset: preset ? a.mimeType : '__custom__',
      mimeCustom: preset ? '' : a.mimeType,
      sizeKb: a.sizeKb !== null ? String(a.sizeKb) : '',
    });
    setSubmitError('');
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    if (!isSubmitting) setModalOpen(false);
  }, [isSubmitting]);

  useEffect(() => {
    if (!modalOpen) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [modalOpen, closeModal]);

  // ─── Submit ────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    const fileName = form.fileName.trim();
    const fileUrl = form.fileUrl.trim();
    const mimeType = resolvedMime(form);
    const sizeKb = form.sizeKb ? parseInt(form.sizeKb, 10) : null;

    if (!fileName) { setSubmitError('File name is required.'); return; }
    if (!fileUrl) { setSubmitError('File URL is required.'); return; }
    if (!mimeType) { setSubmitError('MIME type is required.'); return; }
    if (sizeKb !== null && (isNaN(sizeKb) || sizeKb < 1)) {
      setSubmitError('Size must be at least 1 KB.'); return;
    }

    setIsSubmitting(true);
    const supabase = createClient();

    let error;
    if (editingId) {
      ({ error } = await supabase
        .from('attachments')
        .update({ file_name: fileName, file_url: fileUrl, mime_type: mimeType, size_kb: sizeKb })
        .eq('id', editingId));
    } else {
      const userId = await getCurrentUserId();
      if (!userId) { setSubmitError('Could not identify current user.'); setIsSubmitting(false); return; }
      ({ error } = await supabase.from('attachments').insert({
        file_name: fileName,
        file_url: fileUrl,
        mime_type: mimeType,
        size_kb: sizeKb,
        uploaded_by: userId,
      }));
    }

    if (error) {
      setSubmitError(error.message || `Failed to ${editingId ? 'update' : 'add'} attachment.`);
      setIsSubmitting(false);
      return;
    }

    toast.success(editingId ? 'Attachment updated.' : 'Attachment added.');
    setModalOpen(false);
    setForm(initialForm);
    fetchAttachments();
    setIsSubmitting(false);
  };

  // ─── Delete ────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from('attachments').delete().eq('id', deleteId);
    if (error) {
      toast.error('Failed to delete attachment. It may be linked to a lesson.');
    } else {
      toast.success('Attachment deleted.');
      fetchAttachments();
    }
    setDeleteId(null);
    setIsDeleting(false);
  };

  // ─── Filter & paginate ─────────────────────────────────────────────
  const filtered = attachments.filter(
    (a) =>
      !search ||
      a.fileName.toLowerCase().includes(search.toLowerCase()) ||
      a.mimeType.toLowerCase().includes(search.toLowerCase())
  );
  const totalCount = filtered.length;
  const start = (page - 1) * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, totalCount);
  const paginated = filtered.slice(start, end);

  function formatSize(kb: number | null) {
    if (kb === null) return '—';
    if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
    return `${kb} KB`;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Search & action bar */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center">
        <div className="relative flex-1 max-w-md">
          <input
            type="search"
            placeholder="Search by file name or type..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 placeholder:text-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <button
          type="button" onClick={openAddModal}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Attachment
        </button>
      </div>

      {/* Add / Edit Modal */}
      {modalOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" aria-hidden onClick={closeModal} />
          <div
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg max-h-[90vh] flex flex-col bg-white rounded-xl shadow-xl border border-gray-200"
            role="dialog" aria-modal="true" aria-labelledby="att-modal-title"
          >
            <div className="flex items-center justify-between shrink-0 p-6 pb-0">
              <h2 id="att-modal-title" className="text-lg font-bold text-gray-900">
                {editingId ? 'Edit Attachment' : 'Add Attachment'}
              </h2>
              <button type="button" onClick={closeModal} disabled={isSubmitting}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-50" aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 p-6">
              <div className="space-y-4 overflow-y-auto pr-1 max-h-[60vh]">
                {submitError && (
                  <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2">{submitError}</div>
                )}

                {/* File Name */}
                <div>
                  <label htmlFor="att-name" className="block text-sm font-medium text-gray-700 mb-1">File Name *</label>
                  <input id="att-name" type="text" value={form.fileName}
                    placeholder="e.g. lecture-1-slides.pdf"
                    onChange={(e) => setForm((f) => ({ ...f, fileName: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>

                {/* File URL */}
                <div>
                  <label htmlFor="att-url" className="block text-sm font-medium text-gray-700 mb-1">File URL *</label>
                  <input id="att-url" type="url" value={form.fileUrl}
                    placeholder="https://..."
                    onChange={(e) => setForm((f) => ({ ...f, fileUrl: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                  <p className="text-xs text-gray-500 mt-1">Supabase Storage URL or any publicly accessible file URL.</p>
                </div>

                {/* MIME Type */}
                <div>
                  <label htmlFor="att-mime" className="block text-sm font-medium text-gray-700 mb-1">File Type *</label>
                  <select id="att-mime" value={form.mimePreset}
                    onChange={(e) => setForm((f) => ({ ...f, mimePreset: e.target.value, mimeCustom: '' }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    {MIME_PRESETS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                  {form.mimePreset === '__custom__' && (
                    <input type="text" value={form.mimeCustom}
                      placeholder="e.g. application/x-zip-compressed"
                      onChange={(e) => setForm((f) => ({ ...f, mimeCustom: e.target.value }))}
                      className="w-full mt-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  )}
                </div>

                {/* Size */}
                <div>
                  <label htmlFor="att-size" className="block text-sm font-medium text-gray-700 mb-1">Size (KB)</label>
                  <input id="att-size" type="number" min={1} value={form.sizeKb}
                    placeholder="e.g. 1024"
                    onChange={(e) => setForm((f) => ({ ...f, sizeKb: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 mt-4 shrink-0 border-t border-gray-100">
                <button type="button" onClick={closeModal} disabled={isSubmitting}
                  className="px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 transition disabled:opacity-50"
                >Cancel</button>
                <button type="submit" disabled={isSubmitting}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition disabled:opacity-50 min-w-[130px]"
                >
                  {isSubmitting ? (editingId ? 'Saving...' : 'Adding...') : (editingId ? 'Save Changes' : 'Add Attachment')}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" aria-hidden />
          <div
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-white rounded-xl shadow-xl border border-gray-200 p-6"
            role="dialog" aria-modal="true"
          >
            <h2 className="text-lg font-bold text-gray-900 mb-2">Delete Attachment?</h2>
            <p className="text-sm text-gray-600 mb-6">
              This will permanently delete the attachment record. If it is linked to any lessons, deletion will be blocked.
            </p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteId(null)} disabled={isDeleting}
                className="px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 transition disabled:opacity-50"
              >Cancel</button>
              <button type="button" onClick={handleDelete} disabled={isDeleting}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition disabled:opacity-50 min-w-[100px]"
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
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/80">
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">File</th>
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Type</th>
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Size</th>
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Uploaded</th>
                <th className="text-left text-sm font-semibold text-gray-700 px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-gray-500">Loading attachments...</td>
                </tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-gray-500">
                    {search ? 'No attachments match your search.' : 'No attachments yet. Add one to get started.'}
                  </td>
                </tr>
              ) : (
                paginated.map((a) => (
                  <tr key={a.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xl leading-none">{mimeIcon(a.mimeType)}</span>
                        <div>
                          <div className="text-sm font-medium text-gray-900">{a.fileName}</div>
                          <a
                            href={a.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline truncate max-w-[240px] block"
                          >
                            {a.fileUrl}
                          </a>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600">{a.mimeType}</td>
                    <td className="px-5 py-3 text-sm text-gray-600">{formatSize(a.sizeKb)}</td>
                    <td className="px-5 py-3 text-sm text-gray-500">{a.createdAt}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <a
                          href={a.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900"
                          title="Open file"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                        <button
                          type="button" onClick={() => openEditModal(a)}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900" title="Edit"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button
                          type="button" onClick={() => setDeleteId(a.id)}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-red-600" title="Delete"
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
            {totalCount === 0 ? 'No results' : `Showing ${start + 1}–${end} of ${totalCount}`}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
              className="p-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none" aria-label="Previous page"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button" onClick={() => setPage((p) => p + 1)} disabled={end >= totalCount}
              className="p-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none" aria-label="Next page"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
