'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { InstructorCourseProvider, useInstructorCourse, type OfferingDetails } from '@/contexts/InstructorCourseContext';
import AddModuleModal, { type CourseModule } from '@/components/content/AddModuleModal';
import AddLessonModal, { type Lesson } from '@/components/content/AddLessonModal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ModuleItem {
  id: string;
  module_id: string;
  item_type: string;
  sort_order: number;
  is_visible: boolean;
  is_mandatory: boolean;
  lesson_id: string | null;
  lessons: Lesson | null;
}

interface ModuleWithItems extends CourseModule {
  items: ModuleItem[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const LESSON_TYPE_ICONS: Record<string, string> = {
  video: '📹',
  document: '📄',
  link: '🔗',
  scorm: '📦',
};

function fmt(d: string | null): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function offeringLabel(o: OfferingDetails): string {
  return (
    `${o.courses?.code ?? ''} — ${o.courses?.title ?? ''}` +
    ` (${o.academic_terms?.term_name ?? ''} ${o.academic_terms?.year_start ?? ''}` +
    ` · Sec ${o.section_name} · ${o.enrolled_count} students)`
  );
}

// ─── Drag handle ─────────────────────────────────────────────────────────────

function DragHandle() {
  return (
    <svg className="w-4 h-4 text-gray-400 cursor-grab active:cursor-grabbing" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
    </svg>
  );
}

// ─── Sortable Module Item row ─────────────────────────────────────────────────

function SortableItemRow({
  item,
  onToggleVisible,
  onToggleMandatory,
  onRemove,
}: {
  item: ModuleItem;
  onToggleVisible: (item: ModuleItem) => void;
  onToggleMandatory: (item: ModuleItem) => void;
  onRemove: (item: ModuleItem) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const lesson = item.lessons;
  const icon = lesson ? (LESSON_TYPE_ICONS[lesson.type] ?? '📄') : '📄';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 border-b border-gray-100 last:border-0 group"
    >
      <button type="button" {...attributes} {...listeners} className="shrink-0 p-1 -ml-1">
        <DragHandle />
      </button>
      <span className="text-base shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-gray-900">{lesson?.title ?? 'Unknown'}</span>
        {lesson?.duration_mins && (
          <span className="ml-2 text-xs text-gray-400">{lesson.duration_mins}min</span>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          title={item.is_visible ? 'Hide' : 'Show'}
          onClick={() => onToggleVisible(item)}
          className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
        >
          {item.is_visible ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
          )}
        </button>
        <button
          type="button"
          title={item.is_mandatory ? 'Make optional' : 'Make mandatory'}
          onClick={() => onToggleMandatory(item)}
          className={`p-1.5 rounded hover:bg-gray-100 ${item.is_mandatory ? 'text-purple-600' : 'text-gray-400 hover:text-gray-700'}`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </button>
        <button
          type="button"
          title="Remove"
          onClick={() => onRemove(item)}
          className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-gray-100"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
      {/* Tags */}
      <div className="flex items-center gap-1 shrink-0">
        {!item.is_visible && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">Hidden</span>
        )}
        {item.is_mandatory && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">🔒 Required</span>
        )}
      </div>
    </div>
  );
}

// ─── Sortable Module Card ─────────────────────────────────────────────────────

function SortableModuleCard({
  module,
  onEdit,
  onDelete,
  onToggleVisible,
  onAddLesson,
  onItemToggleVisible,
  onItemToggleMandatory,
  onItemRemove,
  onItemDragEnd,
}: {
  module: ModuleWithItems;
  onEdit: (m: ModuleWithItems) => void;
  onDelete: (m: ModuleWithItems) => void;
  onToggleVisible: (m: ModuleWithItems) => void;
  onAddLesson: (moduleId: string, moduleName: string) => void;
  onItemToggleVisible: (item: ModuleItem) => void;
  onItemToggleMandatory: (item: ModuleItem) => void;
  onItemRemove: (item: ModuleItem) => void;
  onItemDragEnd: (moduleId: string, event: DragEndEvent) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: module.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  return (
    <div ref={setNodeRef} style={style} className="bg-white rounded-xl border border-gray-200 shadow-sm">
      {/* Module header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-100 rounded-t-xl">
        <button type="button" {...attributes} {...listeners} className="shrink-0 p-1">
          <DragHandle />
        </button>

        {/* Expand/collapse */}
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
        >
          <svg
            className={`w-4 h-4 text-gray-500 shrink-0 transition-transform ${expanded ? '' : '-rotate-90'}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          <span className="font-semibold text-gray-900 text-sm truncate">{module.title}</span>
          <span className="text-xs text-gray-400 shrink-0">{module.items.length} item{module.items.length !== 1 ? 's' : ''}</span>
          {!module.is_visible && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-500 font-medium shrink-0">Hidden</span>
          )}
        </button>

        {/* Action menu */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-200 hover:text-gray-700"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" aria-hidden onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg border border-gray-200 shadow-lg z-20 py-1 text-sm">
                <button type="button" onClick={() => { setMenuOpen(false); onEdit(module); }}
                  className="flex items-center gap-2 w-full px-3 py-2 hover:bg-gray-50 text-gray-700">
                  ✏️ Edit
                </button>
                <div className="h-px bg-gray-100 my-1" />
                <button type="button" onClick={() => { setMenuOpen(false); onToggleVisible(module); }}
                  className="flex items-center gap-2 w-full px-3 py-2 hover:bg-gray-50 text-gray-700">
                  {module.is_visible ? '👁 Hide' : '👁 Show'}
                </button>
                <div className="h-px bg-gray-100 my-1" />
                <button type="button" onClick={() => { setMenuOpen(false); onDelete(module); }}
                  className="flex items-center gap-2 w-full px-3 py-2 hover:bg-red-50 text-red-600">
                  🗑️ Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Release date */}
      {module.unlock_date && expanded && (
        <div className="px-4 py-1.5 border-b border-gray-100">
          <p className="text-xs text-gray-400 flex items-center gap-1">
            <span>📅</span>
            Released: {fmt(module.unlock_date)}
          </p>
        </div>
      )}

      {/* Items */}
      {expanded && (
        <div>
          {module.items.length === 0 ? (
            <div className="px-4 py-4 text-sm text-gray-400 text-center">
              No lessons yet in this module.
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(e) => onItemDragEnd(module.id, e)}
            >
              <SortableContext
                items={module.items.map((i) => i.id)}
                strategy={verticalListSortingStrategy}
              >
                {module.items.map((item) => (
                  <SortableItemRow
                    key={item.id}
                    item={item}
                    onToggleVisible={onItemToggleVisible}
                    onToggleMandatory={onItemToggleMandatory}
                    onRemove={onItemRemove}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}

          {/* Add Lesson button */}
          <div className="px-4 py-3 border-t border-gray-100">
            <button
              type="button"
              onClick={() => onAddLesson(module.id, module.title)}
              className="flex items-center gap-2 text-sm text-[#4c1d95] hover:text-[#3b1677] font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Lesson to this module
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Edit Module Modal (inline) ───────────────────────────────────────────────

function EditModuleModal({
  module,
  onClose,
  onSaved,
}: {
  module: ModuleWithItems;
  onClose: () => void;
  onSaved: (updated: Partial<CourseModule> & { id: string }) => void;
}) {
  const [title, setTitle] = useState(module.title);
  const [description, setDescription] = useState(module.description ?? '');
  const [releaseDate, setReleaseDate] = useState(module.unlock_date ?? '');
  const [isVisible, setIsVisible] = useState(module.is_visible);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required.'); return; }
    setSaving(true);
    const supabase = createClient();
    const { error: err } = await supabase
      .from('course_modules')
      .update({
        title: title.trim(),
        description: description.trim() || null,
        unlock_date: releaseDate || null,
        is_visible: isVisible,
      })
      .eq('id', module.id);
    if (err) { setError('Failed to save.'); setSaving(false); return; }
    onSaved({ id: module.id, title: title.trim(), description: description.trim() || null, unlock_date: releaseDate || null, is_visible: isVisible });
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" aria-hidden onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-white rounded-xl shadow-xl border border-gray-200 p-6" role="dialog" aria-modal="true">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Edit Module</h2>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Release Date</label>
            <input type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="em-vis" checked={isVisible} onChange={(e) => setIsVisible(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
            <label htmlFor="em-vis" className="text-sm font-medium text-gray-700">Visible to students</label>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={saving}
              className="px-4 py-2 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 rounded-lg bg-[#4c1d95] text-white text-sm font-medium hover:bg-[#3b1677] disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

// ─── Delete confirm ───────────────────────────────────────────────────────────

function DeleteModuleConfirm({
  module,
  onClose,
  onDeleted,
}: {
  module: ModuleWithItems;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from('course_modules').delete().eq('id', module.id);
    if (error) { toast.error('Failed to delete module.'); setDeleting(false); return; }
    onDeleted(module.id);
    onClose();
    toast.success('Module deleted.');
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" aria-hidden onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-white rounded-xl shadow-xl border border-gray-200 p-6" role="dialog" aria-modal="true">
        <h2 className="text-lg font-bold text-gray-900 mb-2">Delete Module?</h2>
        <p className="text-sm text-gray-600 mb-6">
          This will permanently delete <strong>{module.title}</strong> and all its items. This cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={deleting}
            className="px-4 py-2 rounded-lg border border-gray-200 bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={handleDelete} disabled={deleting}
            className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 min-w-[80px]">
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function CourseContentInner() {
  const { activeOfferingId, setActiveOfferingId, allOfferings, loadingOfferings } =
    useInstructorCourse();

  const [modules, setModules] = useState<ModuleWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modals
  const [addModuleOpen, setAddModuleOpen] = useState(false);
  const [addLessonModule, setAddLessonModule] = useState<{ id: string; name: string } | null>(null);
  const [editModule, setEditModule] = useState<ModuleWithItems | null>(null);
  const [deleteModule, setDeleteModule] = useState<ModuleWithItems | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchModules = useCallback(async (offeringId: string) => {
    if (!offeringId) { setModules([]); setLoading(false); return; }
    setLoading(true);
    const supabase = createClient();

    const { data: mods, error: modErr } = await supabase
      .from('course_modules')
      .select('id, offering_id, title, description, sort_order, is_visible, unlock_date')
      .eq('offering_id', offeringId)
      .order('sort_order', { ascending: true });

    if (modErr) { toast.error('Failed to load modules.'); setLoading(false); return; }

    const modIds = (mods ?? []).map((m: any) => m.id);
    let itemsByModule: Record<string, ModuleItem[]> = {};

    if (modIds.length > 0) {
      const { data: items } = await supabase
        .from('course_module_items')
        .select('id, module_id, item_type, sort_order, is_visible, is_mandatory, lesson_id, lessons(id, title, type, content_url, content_body, duration_mins, is_visible)')
        .in('module_id', modIds)
        .order('sort_order', { ascending: true });

      (items ?? []).forEach((item: any) => {
        if (!itemsByModule[item.module_id]) itemsByModule[item.module_id] = [];
        itemsByModule[item.module_id].push({
          id: item.id,
          module_id: item.module_id,
          item_type: item.item_type,
          sort_order: item.sort_order,
          is_visible: item.is_visible,
          is_mandatory: item.is_mandatory,
          lesson_id: item.lesson_id,
          lessons: item.lessons ?? null,
        });
      });
    }

    setModules(
      (mods ?? []).map((m: any) => ({
        id: m.id,
        offering_id: m.offering_id,
        title: m.title,
        description: m.description,
        sort_order: m.sort_order,
        is_visible: m.is_visible,
        unlock_date: m.unlock_date,
        items: itemsByModule[m.id] ?? [],
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    if (activeOfferingId) fetchModules(activeOfferingId);
  }, [activeOfferingId, fetchModules]);

  // ── Module drag end ────────────────────────────────────────────────────────

  const handleModuleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIdx = modules.findIndex((m) => m.id === active.id);
    const newIdx = modules.findIndex((m) => m.id === over.id);
    const reordered = arrayMove(modules, oldIdx, newIdx);
    setModules(reordered); // optimistic

    const supabase = createClient();
    await Promise.all(
      reordered.map((m, idx) =>
        supabase.from('course_modules').update({ sort_order: idx }).eq('id', m.id),
      ),
    );
  };

  // ── Item drag end ──────────────────────────────────────────────────────────

  const handleItemDragEnd = async (moduleId: string, event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setModules((prev) =>
      prev.map((m) => {
        if (m.id !== moduleId) return m;
        const oldIdx = m.items.findIndex((i) => i.id === active.id);
        const newIdx = m.items.findIndex((i) => i.id === over.id);
        return { ...m, items: arrayMove(m.items, oldIdx, newIdx) };
      }),
    );

    // Persist
    const mod = modules.find((m) => m.id === moduleId);
    if (!mod) return;
    const oldIdx = mod.items.findIndex((i) => i.id === active.id);
    const newIdx = mod.items.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(mod.items, oldIdx, newIdx);
    const supabase = createClient();
    await Promise.all(
      reordered.map((item, idx) =>
        supabase.from('course_module_items').update({ sort_order: idx }).eq('id', item.id),
      ),
    );
  };

  // ── Item actions ───────────────────────────────────────────────────────────

  const toggleItemVisible = async (item: ModuleItem) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('course_module_items')
      .update({ is_visible: !item.is_visible })
      .eq('id', item.id);
    if (error) { toast.error('Failed to update visibility.'); return; }
    setModules((prev) =>
      prev.map((m) => ({
        ...m,
        items: m.items.map((i) => i.id === item.id ? { ...i, is_visible: !i.is_visible } : i),
      })),
    );
  };

  const toggleItemMandatory = async (item: ModuleItem) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('course_module_items')
      .update({ is_mandatory: !item.is_mandatory })
      .eq('id', item.id);
    if (error) { toast.error('Failed to update.'); return; }
    setModules((prev) =>
      prev.map((m) => ({
        ...m,
        items: m.items.map((i) => i.id === item.id ? { ...i, is_mandatory: !i.is_mandatory } : i),
      })),
    );
  };

  const removeItem = async (item: ModuleItem) => {
    const supabase = createClient();
    const { error } = await supabase.from('course_module_items').delete().eq('id', item.id);
    if (error) { toast.error('Failed to remove item.'); return; }
    setModules((prev) =>
      prev.map((m) => ({ ...m, items: m.items.filter((i) => i.id !== item.id) })),
    );
    toast.success('Item removed.');
  };

  // ── Module actions ─────────────────────────────────────────────────────────

  const toggleModuleVisible = async (mod: ModuleWithItems) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('course_modules')
      .update({ is_visible: !mod.is_visible })
      .eq('id', mod.id);
    if (error) { toast.error('Failed to update visibility.'); return; }
    setModules((prev) =>
      prev.map((m) => m.id === mod.id ? { ...m, is_visible: !m.is_visible } : m),
    );
  };

  // ── Filter ─────────────────────────────────────────────────────────────────

  const filtered = search
    ? modules.filter((m) => m.title.toLowerCase().includes(search.toLowerCase()))
    : modules;

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loadingOfferings) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="animate-spin w-6 h-6 border-2 border-[#4c1d95] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900 shrink-0">Course Content</h1>

          {/* Offering picker */}
          <select
            value={activeOfferingId}
            onChange={(e) => setActiveOfferingId(e.target.value)}
            className="flex-1 min-w-[220px] max-w-md border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            {allOfferings.map((o) => (
              <option key={o.id} value={o.id}>{offeringLabel(o)}</option>
            ))}
          </select>

          {/* Search */}
          <div className="relative max-w-xs w-full">
            <input
              type="search"
              placeholder="Search modules..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 placeholder:text-gray-400"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setAddModuleOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#4c1d95] text-white text-sm font-medium hover:bg-[#3b1677] transition shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Module
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-6 h-6 border-2 border-[#4c1d95] border-t-transparent rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
          <div className="text-5xl mb-4">📚</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">
            {search ? 'No modules match your search.' : 'No modules yet'}
          </h2>
          {!search && (
            <>
              <p className="text-sm text-gray-500 mb-6">Start building your course by adding the first module.</p>
              <button
                type="button"
                onClick={() => setAddModuleOpen(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#4c1d95] text-white text-sm font-medium hover:bg-[#3b1677] transition"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add First Module
              </button>
            </>
          )}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleModuleDragEnd}
        >
          <SortableContext
            items={filtered.map((m) => m.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-4">
              {filtered.map((mod) => (
                <SortableModuleCard
                  key={mod.id}
                  module={mod}
                  onEdit={(m) => setEditModule(m)}
                  onDelete={(m) => setDeleteModule(m)}
                  onToggleVisible={toggleModuleVisible}
                  onAddLesson={(id, name) => setAddLessonModule({ id, name })}
                  onItemToggleVisible={toggleItemVisible}
                  onItemToggleMandatory={toggleItemMandatory}
                  onItemRemove={removeItem}
                  onItemDragEnd={handleItemDragEnd}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Add Module Modal */}
      {addModuleOpen && (
        <AddModuleModal
          onClose={() => setAddModuleOpen(false)}
          onSuccess={(mod) => {
            setModules((prev) => [...prev, { ...mod, items: [] }]);
            toast.success('Module created.');
          }}
        />
      )}

      {/* Add Lesson Modal (from inside a module) */}
      {addLessonModule && (
        <AddLessonModal
          moduleId={addLessonModule.id}
          moduleName={addLessonModule.name}
          onClose={() => setAddLessonModule(null)}
          onSuccess={() => {
            fetchModules(activeOfferingId);
            toast.success('Lesson added.');
          }}
          onOpenAddModule={() => { setAddLessonModule(null); setAddModuleOpen(true); }}
        />
      )}

      {/* Edit Module Modal */}
      {editModule && (
        <EditModuleModal
          module={editModule}
          onClose={() => setEditModule(null)}
          onSaved={(updated) => {
            setModules((prev) =>
              prev.map((m) => m.id === updated.id ? { ...m, ...updated } : m),
            );
            setEditModule(null);
            toast.success('Module updated.');
          }}
        />
      )}

      {/* Delete Module Confirm */}
      {deleteModule && (
        <DeleteModuleConfirm
          module={deleteModule}
          onClose={() => setDeleteModule(null)}
          onDeleted={(id) => {
            setModules((prev) => prev.filter((m) => m.id !== id));
            setDeleteModule(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Wrap with provider ───────────────────────────────────────────────────────

export default function CourseContentPage() {
  return (
    <InstructorCourseProvider>
      <CourseContentInner />
    </InstructorCourseProvider>
  );
}
