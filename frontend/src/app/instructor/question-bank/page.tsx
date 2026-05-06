'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

// ─── Types ───────────────────────────────────────────────────────────────────

type QuestionType = 'mcq' | 'true_false' | 'short_answer' | 'fill_blank' | 'essay' | 'matching';

interface Assessment {
  id: string;
  title: string;
  offering_label: string;
}

interface QuestionOption {
  body: string;
  is_correct: boolean;
}

interface QuestionRow {
  type: QuestionType;
  body: string;
  marks: number;
  explanation: string;
  media_url: string;
  options: QuestionOption[];
}

// ─── CSV helpers ──────────────────────────────────────────────────────────────

const QUESTION_TYPES: QuestionType[] = ['mcq', 'true_false', 'short_answer', 'fill_blank', 'essay', 'matching'];
const MAX_OPTIONS = 6;

const CSV_HEADER = [
  'type', 'body', 'marks', 'explanation', 'media_url',
  ...Array.from({ length: MAX_OPTIONS }, (_, i) => [`opt${i + 1}_body`, `opt${i + 1}_correct`]).flat(),
].join(',');

const CSV_TEMPLATE_ROWS = [
  `mcq,"What is 2 + 2?",1,"The answer is 4",,4,true,3,false,2,false,1,false,,`,
  `true_false,"The sky is blue.",1,"Due to Rayleigh scattering",,True,true,False,false,,,,,,`,
  `short_answer,"Explain the water cycle briefly.",3,,,,,,,,,,,,,`,
  `essay,"Describe the impact of climate change.",10,,,,,,,,,,,,,`,
].join('\n');

function escapeCSV(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function buildCSVFromQuestions(questions: QuestionRow[]): string {
  const rows = questions.map(q => {
    const optCols: string[] = [];
    for (let i = 0; i < MAX_OPTIONS; i++) {
      const opt = q.options[i];
      optCols.push(opt ? escapeCSV(opt.body) : '');
      optCols.push(opt ? String(opt.is_correct) : '');
    }
    return [
      q.type,
      escapeCSV(q.body),
      String(q.marks),
      escapeCSV(q.explanation),
      escapeCSV(q.media_url),
      ...optCols,
    ].join(',');
  });
  return [CSV_HEADER, ...rows].join('\n');
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Simple CSV parser that handles quoted fields
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQuote = !inQuote; }
    } else if (ch === ',' && !inQuote) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

interface ParseResult {
  questions: QuestionRow[];
  detectedColumns: string[];
  missingRequired: string[];
  badTypeRows: number;
}

function parseCSV(text: string): ParseResult {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) return { questions: [], detectedColumns: [], missingRequired: ['type', 'body'], badTypeRows: 0 };

  const header = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
  const detectedColumns = header;

  const typeIdx = header.indexOf('type');
  const bodyIdx = header.indexOf('body');
  const marksIdx = header.indexOf('marks');
  const explIdx = header.indexOf('explanation');
  const mediaIdx = header.indexOf('media_url');

  const missingRequired: string[] = [];
  if (typeIdx === -1) missingRequired.push('type');
  if (bodyIdx === -1) missingRequired.push('body');
  if (missingRequired.length > 0) return { questions: [], detectedColumns, missingRequired, badTypeRows: 0 };

  const questions: QuestionRow[] = [];
  let badTypeRows = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const type = (cols[typeIdx] ?? '').toLowerCase() as QuestionType;
    if (!QUESTION_TYPES.includes(type)) { badTypeRows++; continue; }
    const body = cols[bodyIdx] ?? '';
    if (!body.trim()) continue;
    const marks = Math.max(1, parseInt(cols[marksIdx] ?? '1', 10) || 1);
    const explanation = cols[explIdx] ?? '';
    const media_url = cols[mediaIdx] ?? '';

    const options: QuestionOption[] = [];
    for (let o = 0; o < MAX_OPTIONS; o++) {
      const bodyCol = header.indexOf(`opt${o + 1}_body`);
      const correctCol = header.indexOf(`opt${o + 1}_correct`);
      const optBody = cols[bodyCol] ?? '';
      if (!optBody.trim()) break;
      options.push({
        body: optBody,
        is_correct: (cols[correctCol] ?? '').toLowerCase() === 'true',
      });
    }

    questions.push({ type, body, marks, explanation, media_url, options });
  }
  return { questions, detectedColumns, missingRequired, badTypeRows };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function QuestionBankPage() {
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<'export' | 'import'>('export');
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);

  // Export state
  const [exportAssessmentId, setExportAssessmentId] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportCount, setExportCount] = useState<number | null>(null);

  // Import state
  const [importAssessmentId, setImportAssessmentId] = useState('');
  const [previewRows, setPreviewRows] = useState<QuestionRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);

  const loadAssessments = useCallback(async () => {
    setLoading(true);
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) { setLoading(false); return; }
    const { data: userData } = await supabase.from('users').select('id').eq('auth_user_id', authData.user.id).single();
    if (!userData) { setLoading(false); return; }

    const { data: ciRows } = await supabase
      .from('course_instructors')
      .select('offering_id, course_offerings!fk_course_instructors_offering(section_name, courses!fk_course_offerings_course(code, title))')
      .eq('instructor_id', userData.id);

    const offeringIds = (ciRows ?? []).map((r: any) => r.offering_id);
    if (!offeringIds.length) { setLoading(false); return; }

    const offeringLabels: Record<string, string> = {};
    (ciRows ?? []).forEach((r: any) => {
      const co = r.course_offerings;
      offeringLabels[r.offering_id] = `${co?.courses?.code ?? ''} – ${co?.section_name ?? r.offering_id}`;
    });

    const { data: asmtRows } = await supabase
      .from('assessments')
      .select('id, title, offering_id')
      .in('offering_id', offeringIds)
      .order('title');

    setAssessments((asmtRows ?? []).map((a: any) => ({
      id: a.id,
      title: a.title,
      offering_label: offeringLabels[a.offering_id] ?? a.offering_id,
    })));
    setLoading(false);
  }, []);

  useEffect(() => { loadAssessments(); }, [loadAssessments]);

  // Update exportCount when assessment changes
  useEffect(() => {
    if (!exportAssessmentId) { setExportCount(null); return; }
    supabase
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .eq('assessment_id', exportAssessmentId)
      .then(({ count }) => setExportCount(count ?? 0));
  }, [exportAssessmentId]);

  // ── Export ──────────────────────────────────────────────────────────────────

  const handleExport = async () => {
    if (!exportAssessmentId) { toast.error('Select an assessment'); return; }
    setExporting(true);
    const { data: qRows, error } = await supabase
      .from('questions')
      .select('id, type, body, marks, explanation, media_url, question_options(body, is_correct, sort_order)')
      .eq('assessment_id', exportAssessmentId)
      .order('sort_order');

    if (error) { toast.error(error.message); setExporting(false); return; }

    const rows: QuestionRow[] = (qRows ?? []).map((q: any) => ({
      type: q.type,
      body: q.body ?? '',
      marks: q.marks ?? 1,
      explanation: q.explanation ?? '',
      media_url: q.media_url ?? '',
      options: ((q.question_options ?? []) as any[])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(o => ({ body: o.body ?? '', is_correct: o.is_correct ?? false })),
    }));

    const asmt = assessments.find(a => a.id === exportAssessmentId);
    const safeName = (asmt?.title ?? 'questions').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    downloadCSV(buildCSVFromQuestions(rows), `${safeName}_question_bank.csv`);
    toast.success(`Exported ${rows.length} question${rows.length !== 1 ? 's' : ''}`);
    setExporting(false);
  };

  const handleDownloadTemplate = () => {
    downloadCSV(`${CSV_HEADER}\n${CSV_TEMPLATE_ROWS}`, 'question_bank_template.csv');
  };

  // ── Import ──────────────────────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParseError(null);
    setPreviewRows([]);
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const { questions, detectedColumns, missingRequired, badTypeRows } = parseCSV(text);
      setPreviewRows(questions);
      if (questions.length === 0) {
        let msg = 'No valid questions found.';
        if (missingRequired.length > 0) {
          msg = `Missing required column${missingRequired.length > 1 ? 's' : ''}: "${missingRequired.join('", "')}". `;
          msg += `Your file has: ${detectedColumns.slice(0, 6).join(', ')}${detectedColumns.length > 6 ? '…' : ''}.`;
        } else if (badTypeRows > 0) {
          msg = `${badTypeRows} row${badTypeRows > 1 ? 's' : ''} skipped — "type" values must be one of: ${QUESTION_TYPES.join(', ')}. `;
          msg += `This looks like a different CSV (e.g. attendance). Download the Question Bank template instead.`;
        }
        setParseError(msg);
      } else {
        toast.success(`Parsed ${questions.length} question${questions.length !== 1 ? 's' : ''} — review below`);
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!importAssessmentId) { toast.error('Select a target assessment'); return; }
    if (previewRows.length === 0) { toast.error('No questions to import'); return; }
    setImporting(true);

    let imported = 0;
    let failed = 0;

    for (const q of previewRows) {
      const { data: qData, error: qErr } = await supabase
        .from('questions')
        .insert({
          assessment_id: importAssessmentId,
          type: q.type,
          body: q.body,
          marks: q.marks,
          explanation: q.explanation || null,
          media_url: q.media_url || null,
          sort_order: imported,
        })
        .select('id')
        .single();

      if (qErr || !qData) { failed++; continue; }

      if (q.options.length > 0) {
        const optPayload = q.options.map((o, idx) => ({
          question_id: qData.id,
          body: o.body,
          is_correct: o.is_correct,
          sort_order: idx,
        }));
        await supabase.from('question_options').insert(optPayload);
      }

      imported++;
    }

    setImporting(false);
    if (imported > 0) {
      toast.success(`Imported ${imported} question${imported !== 1 ? 's' : ''} successfully`);
      setPreviewRows([]);
      setFileName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
    if (failed > 0) toast.error(`${failed} question${failed !== 1 ? 's' : ''} failed to import`);
  };

  const clearPreview = () => {
    setPreviewRows([]);
    setFileName('');
    setParseError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  const typeBadge = (t: QuestionType) => {
    const map: Record<QuestionType, string> = {
      mcq: 'bg-purple-100 text-purple-700',
      true_false: 'bg-blue-100 text-blue-700',
      short_answer: 'bg-green-100 text-green-700',
      fill_blank: 'bg-yellow-100 text-yellow-800',
      essay: 'bg-orange-100 text-orange-700',
      matching: 'bg-pink-100 text-pink-700',
    };
    return map[t] ?? 'bg-gray-100 text-gray-600';
  };

  const typeLabel: Record<QuestionType, string> = {
    mcq: 'MCQ',
    true_false: 'True/False',
    short_answer: 'Short Answer',
    fill_blank: 'Fill Blank',
    essay: 'Essay',
    matching: 'Matching',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-700" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Question Bank</h1>
        <p className="text-sm text-gray-500 mt-1">Import questions from CSV or export existing question banks for reuse across courses.</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        {(['export', 'import'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-6 py-3 text-sm font-medium capitalize border-b-2 transition-colors ${
              tab === t
                ? 'border-purple-700 text-purple-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'export' ? 'Export Questions' : 'Import Questions'}
          </button>
        ))}
      </div>

      {/* ── EXPORT TAB ── */}
      {tab === 'export' && (
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Export Question Bank (CSV)</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Select Assessment</label>
                <select
                  value={exportAssessmentId}
                  onChange={e => setExportAssessmentId(e.target.value)}
                  className="w-full sm:w-96 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">— Choose an assessment —</option>
                  {assessments.map(a => (
                    <option key={a.id} value={a.id}>{a.offering_label} › {a.title}</option>
                  ))}
                </select>
              </div>

              {exportAssessmentId && exportCount !== null && (
                <p className="text-sm text-gray-500">
                  {exportCount === 0
                    ? 'This assessment has no questions yet.'
                    : `${exportCount} question${exportCount !== 1 ? 's' : ''} will be exported.`}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={exporting || !exportAssessmentId || exportCount === 0}
                  className="px-4 py-2 bg-purple-700 text-white rounded-lg text-sm font-medium hover:bg-purple-800 disabled:opacity-50"
                >
                  {exporting ? 'Exporting…' : 'Download CSV'}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                >
                  Download Template
                </button>
              </div>
            </div>
          </div>

          {/* CSV Format Reference */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">CSV Format</h3>
            <div className="text-xs text-gray-600 space-y-1">
              <p>The exported file has one row per question with these columns:</p>
              <div className="mt-2 overflow-x-auto">
                <table className="text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-100">
                      {['type', 'body', 'marks', 'explanation', 'media_url', 'opt1_body', 'opt1_correct', '…up to opt6'].map(h => (
                        <th key={h} className="border border-gray-200 px-2 py-1 text-left font-medium text-gray-600">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {['mcq', 'What is 2+2?', '1', '', '', '4', 'true', '…'].map((v, i) => (
                        <td key={i} className="border border-gray-200 px-2 py-1 text-gray-500">{v}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-2">Supported types: <span className="font-mono">mcq · true_false · short_answer · fill_blank · essay · matching</span></p>
              <p>Options are only used for <span className="font-mono">mcq</span> and <span className="font-mono">true_false</span> types.</p>
            </div>
          </div>
        </div>
      )}

      {/* ── IMPORT TAB ── */}
      {tab === 'import' && (
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-4">Import Questions from CSV</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Target Assessment</label>
                <select
                  value={importAssessmentId}
                  onChange={e => setImportAssessmentId(e.target.value)}
                  className="w-full sm:w-96 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">— Choose an assessment —</option>
                  {assessments.map(a => (
                    <option key={a.id} value={a.id}>{a.offering_label} › {a.title}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Upload CSV File</label>
                <div className="flex items-center gap-3">
                  <label className="cursor-pointer px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                    Choose File
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,text/csv"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </label>
                  {fileName && (
                    <span className="text-sm text-gray-500 truncate max-w-xs">{fileName}</span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Must be a Question Bank CSV.{' '}
                  <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    className="text-purple-700 hover:underline"
                  >
                    Download template
                  </button>{' '}
                  to see the required format.
                </p>
              </div>

              {/* Parse error */}
              {parseError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  <p className="font-medium mb-1">Could not read questions from this file</p>
                  <p className="text-xs text-red-600">{parseError}</p>
                  <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    className="mt-2 text-xs font-medium text-purple-700 hover:underline"
                  >
                    Download Question Bank template →
                  </button>
                </div>
              )}

              {previewRows.length > 0 && (
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleImport}
                    disabled={importing || !importAssessmentId}
                    className="px-4 py-2 bg-purple-700 text-white rounded-lg text-sm font-medium hover:bg-purple-800 disabled:opacity-50"
                  >
                    {importing ? 'Importing…' : `Import ${previewRows.length} Question${previewRows.length !== 1 ? 's' : ''}`}
                  </button>
                  <button
                    type="button"
                    onClick={clearPreview}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Preview Table */}
          {previewRows.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-800">
                  Preview — {previewRows.length} question{previewRows.length !== 1 ? 's' : ''}
                </span>
                <span className="text-xs text-gray-400">Review before importing</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium w-6">#</th>
                      <th className="px-4 py-3 text-left font-medium">Type</th>
                      <th className="px-4 py-3 text-left font-medium">Question</th>
                      <th className="px-4 py-3 text-left font-medium">Marks</th>
                      <th className="px-4 py-3 text-left font-medium">Options</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {previewRows.map((q, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-400 text-xs">{i + 1}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${typeBadge(q.type)}`}>
                            {typeLabel[q.type]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-800 max-w-sm">
                          <p className="line-clamp-2">{q.body}</p>
                          {q.explanation && (
                            <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">Explanation: {q.explanation}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-700 font-medium">{q.marks}</td>
                        <td className="px-4 py-3">
                          {q.options.length > 0 ? (
                            <ul className="text-xs space-y-0.5">
                              {q.options.map((o, oi) => (
                                <li key={oi} className={o.is_correct ? 'text-green-700 font-medium' : 'text-gray-500'}>
                                  {o.is_correct ? '✓ ' : '✗ '}{o.body}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Empty state when no file chosen */}
          {previewRows.length === 0 && !fileName && (
            <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-10 text-center">
              <p className="text-sm text-gray-500 mb-2">Upload a CSV file to preview and import questions.</p>
              <p className="text-xs text-gray-400">
                Need a template? Go to the <button type="button" onClick={() => setTab('export')} className="text-purple-700 hover:underline">Export tab</button> and click "Download Template".
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
