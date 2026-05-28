'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import Link from 'next/link';
import RichTextEditor from '@/components/shared/RichTextEditor';
import { InlineAnnotator, type Annotation } from '@/components/instructor/InlineAnnotator';

type AssignmentDetail = {
  id: string;
  title: string;
  brief: string | null;
  due_date: string;
  max_score: number;
  allow_files: boolean;
  allow_text: boolean;
  allow_url: boolean;
  allow_media: boolean;
  late_allowed: boolean;
  offering_id: string;
  course_name: string;
  assignment_type: string;
  group_assignment: boolean;
};

type Submission = {
  id: string;
  text_body: string | null;
  file_urls: string[] | null;
  url_submission: string | null;
  media_urls: string[] | null;
  draft_text: string | null;
  draft_saved_at: string | null;
  status: string;
  submitted_at: string;
  score: number | null;
  final_score: number | null;
  feedback: string | null;
  annotations: Annotation[];
};

type PendingFile = { file: File; name: string; sizeKb: number };

export default function AssignmentSubmitPage() {
  const { id } = useParams<{ id: string }>();
  const router   = useRouter();

  const [assignment, setAssignment]   = useState<AssignmentDetail | null>(null);
  const [submission, setSubmission]   = useState<Submission | null>(null);
  const [userId, setUserId]           = useState<string | null>(null);
  const [enrollmentId, setEnrollmentId] = useState<string | null>(null);
  const [loading, setLoading]         = useState(true);
  const [textBody, setTextBody]       = useState('');
  const [urlSubmission, setUrlSubmission] = useState('');
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [pendingMedia, setPendingMedia] = useState<PendingFile[]>([]);
  const [submitting, setSubmitting]   = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [success, setSuccess]         = useState(false);
  const [plagChecking, setPlagChecking] = useState(false);
  const [plagResult, setPlagResult]   = useState<{ similarity_pct: number; match_count: number } | null>(null);
  const [internetChecking, setInternetChecking] = useState(false);
  const [internetReport, setInternetReport] = useState<{ status: string; similarity_pct: number | null; error_message: string | null; source_matches: Array<{ similarity_pct: number; source_url?: string; source_title?: string }> | null } | null>(null);
  const internetPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [myReports, setMyReports]     = useState<Array<{ id: string; status: string; similarity_pct: number | null; provider: string; provider_report_url: string | null; error_message: string | null; completed_at: string | null; requested_at: string }>>([]);
  const [reportChecking, setReportChecking] = useState(false);
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data: profile } = await supabase.from('users').select('id').eq('auth_user_id', user.id).single();
      if (!profile) return;
      setUserId(profile.id);

      const { data: asgn } = await supabase
        .from('assignments')
        .select(`id, title, brief, due_date, max_score, allow_files, allow_text, allow_url, allow_media, late_allowed, offering_id, assignment_type, group_assignment, course_offerings(courses(title))`)
        .eq('id', id)
        .single();

      if (!asgn) { setLoading(false); return; }
      setAssignment({
        id: asgn.id, title: asgn.title, brief: asgn.brief, due_date: asgn.due_date,
        max_score: asgn.max_score, allow_files: asgn.allow_files, allow_text: asgn.allow_text,
        allow_url: (asgn as any).allow_url ?? false, allow_media: (asgn as any).allow_media ?? false,
        late_allowed: asgn.late_allowed, offering_id: asgn.offering_id,
        assignment_type: (asgn as any).assignment_type ?? 'individual',
        group_assignment: (asgn as any).group_assignment ?? false,
        course_name: (asgn as any).course_offerings?.courses?.title ?? 'Unknown Course',
      });

      const { data: enrollment } = await supabase
        .from('enrollments').select('id').eq('student_id', profile.id)
        .eq('offering_id', asgn.offering_id).eq('status', 'active').single();
      if (enrollment) setEnrollmentId(enrollment.id);

      const { data: sub } = await supabase
        .from('assignment_submissions')
        .select('id, text_body, file_urls, url_submission, media_urls, draft_text, draft_saved_at, status, submitted_at, score, final_score, feedback, annotations')
        .eq('assignment_id', id).eq('student_id', profile.id).maybeSingle();
      if (sub) {
        setSubmission({ ...(sub as any), annotations: Array.isArray((sub as any).annotations) ? (sub as any).annotations : [] });
        setTextBody(sub.text_body ?? (sub as any).draft_text ?? '');
        setUrlSubmission((sub as any).url_submission ?? '');
        if ((sub as any).draft_saved_at) setDraftSavedAt(new Date((sub as any).draft_saved_at));
        // Load existing plagiarism reports for this submission
        if ((sub as any).status === 'submitted' || (sub as any).status === 'graded') {
          fetch(`/api/plagiarism/my-report/${(sub as any).id}`)
            .then(r => r.json())
            .then(d => { if (d.reports) setMyReports(d.reports); })
            .catch(() => {});
        }
      }

      setLoading(false);
    })();
  }, [id]);

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    setPendingFiles(prev => [...prev, ...picked.map(f => ({ file: f, name: f.name, sizeKb: Math.ceil(f.size / 1024) }))]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  const removePendingFile  = (idx: number) => setPendingFiles(prev => prev.filter((_, i) => i !== idx));

  const handleMediaPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    setPendingMedia(prev => [...prev, ...picked.map(f => ({ file: f, name: f.name, sizeKb: Math.ceil(f.size / 1024) }))]);
    if (mediaInputRef.current) mediaInputRef.current.value = '';
  };
  const removePendingMedia = (idx: number) => setPendingMedia(prev => prev.filter((_, i) => i !== idx));

  // Draft auto-save (debounced 15s after last change)
  const scheduleDraftSave = (text: string, url: string) => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(async () => {
      if (!userId || !assignment || !enrollmentId) return;
      setDraftSaving(true);
      const supabase = createClient();
      const base = { assignment_id: assignment.id, student_id: userId, enrollment_id: enrollmentId };
      if (submission) {
        await supabase.from('assignment_submissions').update({ draft_text: text || null, draft_saved_at: new Date().toISOString() }).eq('id', submission.id);
      } else {
        // Upsert a draft row
        await supabase.from('assignment_submissions').upsert({ ...base, draft_text: text || null, draft_saved_at: new Date().toISOString(), status: 'draft', is_late: false }, { onConflict: 'assignment_id,student_id' });
      }
      setDraftSavedAt(new Date());
      setDraftSaving(false);
    }, 15_000);
  };

  // Pre-submission internet (Copyleaks) check with polling for async results
  const runInternetCheck = async () => {
    if (!assignment) return;
    if (internetPollRef.current) clearTimeout(internetPollRef.current);
    setInternetChecking(true);
    setInternetReport(null);
    try {
      const res = await fetch('/api/plagiarism/student-internet-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignment_id: assignment.id, text: textBody }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInternetReport({ status: 'failed', similarity_pct: null, error_message: data.error ?? 'Internet check failed', source_matches: null });
        setInternetChecking(false);
        return;
      }

      const submissionId = data.submission_id as string;
      let polls = 0;
      const poll = async () => {
        polls++;
        try {
          const r = await fetch(`/api/plagiarism/my-report/${submissionId}`);
          const d = await r.json();
          const cl = (d.reports ?? []).find((x: any) => x.provider === 'copyleaks');
          if (cl && (cl.status === 'completed' || cl.status === 'failed')) {
            setInternetReport(cl);
            setInternetChecking(false);
            return;
          }
        } catch { /* keep polling */ }
        if (polls >= 48) { // ~4 minutes
          setInternetReport({ status: 'pending', similarity_pct: null, error_message: null, source_matches: null });
          setInternetChecking(false);
          return;
        }
        internetPollRef.current = setTimeout(poll, 5000);
      };
      internetPollRef.current = setTimeout(poll, 5000);
    } catch {
      setInternetReport({ status: 'failed', similarity_pct: null, error_message: 'Internet check failed', source_matches: null });
      setInternetChecking(false);
    }
  };

  useEffect(() => () => { if (internetPollRef.current) clearTimeout(internetPollRef.current); }, []);

  const handleSubmit = async () => {
    if (!assignment || !userId || !enrollmentId) return;
    setError(null);

    const now = new Date();
    const due = new Date(assignment.due_date);
    const isLate = now > due;
    if (isLate && !assignment.late_allowed) {
      setError('This assignment is past due and late submissions are not allowed.');
      return;
    }

    const hasText  = textBody.replace(/<[^>]+>/g, '').trim().length > 0;
    const hasFiles = pendingFiles.length > 0 || (submission?.file_urls?.length ?? 0) > 0;
    const hasUrl   = urlSubmission.trim().length > 0;
    const hasMedia = pendingMedia.length > 0 || (submission?.media_urls?.length ?? 0) > 0;
    if (!hasText && !hasFiles && !hasUrl && !hasMedia) {
      setError('Please write a response, attach a file, provide a URL, or upload media.');
      return;
    }

    setSubmitting(true);
    const supabase = createClient();

    // Upload new files
    const newFileUrls: string[] = [];
    for (const pf of pendingFiles) {
      const path = `assignments/${assignment.id}/${userId}/${Date.now()}_${pf.name}`;
      const { error: upErr } = await supabase.storage.from('lms-uploads').upload(path, pf.file, { upsert: true });
      if (upErr) { setError(`File upload failed: ${upErr.message}`); setSubmitting(false); return; }
      const { data: urlData } = supabase.storage.from('lms-uploads').getPublicUrl(path);
      newFileUrls.push(urlData.publicUrl);
    }

    // Upload media files
    const newMediaUrls: string[] = [];
    for (const mf of pendingMedia) {
      const path = `assignments/${assignment.id}/${userId}/media/${Date.now()}_${mf.name}`;
      const { error: upErr } = await supabase.storage.from('lms-uploads').upload(path, mf.file, { upsert: true });
      if (upErr) { setError(`Media upload failed: ${upErr.message}`); setSubmitting(false); return; }
      const { data: urlData } = supabase.storage.from('lms-uploads').getPublicUrl(path);
      newMediaUrls.push(urlData.publicUrl);
    }

    const allFileUrls  = [...(submission?.file_urls ?? []), ...newFileUrls];
    const allMediaUrls = [...(submission?.media_urls ?? []), ...newMediaUrls];

    const payload: Record<string, unknown> = {
      assignment_id:  assignment.id, student_id: userId, enrollment_id: enrollmentId,
      is_late:        isLate, status: 'submitted', submitted_at: now.toISOString(),
      text_body:      hasText  ? textBody          : null,
      file_urls:      allFileUrls.length  > 0 ? allFileUrls  : null,
      url_submission: hasUrl   ? urlSubmission.trim() : null,
      media_urls:     allMediaUrls.length > 0 ? allMediaUrls : null,
      draft_text:     null, // clear draft on submit
      draft_saved_at: null,
    };

    let submissionId = submission?.id ?? null;
    if (submission) {
      const { error: updateError } = await supabase.from('assignment_submissions').update(payload).eq('id', submission.id);
      if (updateError) { setError(updateError.message); setSubmitting(false); return; }
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('assignment_submissions').upsert(payload, { onConflict: 'assignment_id,student_id' }).select('id').single();
      if (insertError) { setError(insertError.message); setSubmitting(false); return; }
      submissionId = (inserted as any)?.id ?? null;
    }

    // Fire-and-forget: native check (instant) + Copyleaks (async internet check)
    if (submissionId && hasText) {
      fetch('/api/plagiarism/check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: submissionId, provider: 'native' }),
      }).catch(() => {});
      fetch('/api/plagiarism/check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: submissionId, provider: 'copyleaks' }),
      }).catch(() => {});
    }

    setPendingFiles([]);
    setSubmitting(false);
    toast.success('Assignment submitted! Plagiarism check running in background.');
    router.push('/dashboard');
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-[#4c1d95] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="p-6 text-center text-gray-500">
        <p className="text-4xl mb-3">📭</p>
        <p>Assignment not found.</p>
        <Link href="/dashboard/assignments" className="text-[#4c1d95] underline text-sm mt-2 inline-block">Back to Assignments</Link>
      </div>
    );
  }

  const isOverdue        = new Date(assignment.due_date) < new Date();
  const canSubmit        = !isOverdue || assignment.late_allowed;
  const alreadySubmitted = !!submission;
  const needsResubmit    = submission?.status === 'resubmit_required';
  const isEditable       = (!alreadySubmitted && canSubmit) || needsResubmit;
  const isGraded         = submission?.score != null;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* Back */}
        <Link href="/dashboard/assignments" className="inline-flex items-center gap-1 text-sm text-[#4c1d95] hover:underline mb-5">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M9.78 4.22a.75.75 0 0 1 0 1.06L7.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L5.47 8.53a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
          </svg>
          Back to Assignments
        </Link>

        {/* Header card */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm mb-4">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-xs font-medium text-[#4c1d95] bg-purple-50 px-2 py-0.5 rounded-full">{assignment.course_name}</span>
            {isGraded && <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">Graded</span>}
            {!isGraded && alreadySubmitted && <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">Submitted</span>}
            {needsResubmit && <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">Resubmission Required</span>}
            {!alreadySubmitted && isOverdue && <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">Overdue</span>}
            {!alreadySubmitted && !isOverdue && <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Pending</span>}
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">{assignment.title}</h1>
          <div className="flex flex-wrap gap-5 text-sm text-gray-500">
            <span className={`flex items-center gap-1.5 ${!alreadySubmitted && isOverdue ? 'text-red-500 font-medium' : ''}`}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M1 8a7 7 0 1 1 14 0A7 7 0 0 1 1 8Zm7.75-4.25a.75.75 0 0 0-1.5 0V8c0 .414.336.75.75.75h3.25a.75.75 0 0 0 0-1.5h-2.5V3.75Z" clipRule="evenodd" />
              </svg>
              Due {formatDate(assignment.due_date)}
            </span>
            <span className="flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"><path d="M11.5 9.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/><path fillRule="evenodd" d="M2 3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H2Zm1.5 7.5v-5h9v5h-9Z" clipRule="evenodd"/></svg>
              Max Score: {assignment.max_score} pts
            </span>
            {assignment.late_allowed && <span className="text-green-600">Late submissions allowed</span>}
            {alreadySubmitted && <span className="text-gray-400">Submitted {formatDate(submission!.submitted_at)}</span>}
          </div>
        </div>

        {/* Instructions */}
        {assignment.brief && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm mb-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Instructions</h2>
            <div className="prose prose-sm max-w-none text-gray-700" dangerouslySetInnerHTML={{ __html: assignment.brief }} />
          </div>
        )}

        {/* Grade */}
        {isGraded && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-4 space-y-3">
            <h2 className="text-sm font-semibold text-green-800 uppercase tracking-wide">Grade</h2>
            <p className="text-3xl font-bold text-green-700">
              {submission!.final_score ?? submission!.score}
              <span className="text-lg font-normal text-green-600 ml-1">/ {assignment.max_score}</span>
            </p>
            {submission!.feedback && (
              <div className="text-sm text-green-800 bg-white border border-green-200 rounded-lg p-3">
                <span className="font-medium block mb-1">Instructor Feedback</span>
                <p className="whitespace-pre-wrap">{submission!.feedback}</p>
              </div>
            )}
            {submission!.text_body && submission!.annotations.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-green-800 mb-2">Annotated Submission</p>
                <InlineAnnotator
                  text={submission!.text_body}
                  annotations={submission!.annotations}
                  readOnly
                />
              </div>
            )}
          </div>
        )}

        {/* Submission area */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <h2 className="text-sm font-semibold text-gray-800">
              {alreadySubmitted && !needsResubmit ? 'Your Submission' : 'Your Response'}
            </h2>
            {alreadySubmitted && !needsResubmit && (
              <p className="text-xs text-gray-400 mt-0.5">Submitted {formatDate(submission!.submitted_at)}</p>
            )}
          </div>

          <div className="p-6 space-y-5">
            {/* Text response */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Written Response</label>
              {isEditable ? (
                <RichTextEditor
                  value={textBody}
                  onChange={html => { setTextBody(html); scheduleDraftSave(html, urlSubmission); }}
                  minHeight="220px"
                />
              ) : (
                <div
                  className={`w-full border border-gray-200 rounded-lg p-4 text-sm text-gray-700 bg-gray-50 min-h-[160px] prose prose-sm max-w-none`}
                  dangerouslySetInnerHTML={{ __html: submission?.text_body || '<span class="text-gray-400 italic">No text submitted</span>' }}
                />
              )}
            </div>

            {/* File attachments */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">File Attachments</label>

              {/* Previously submitted files */}
              {submission?.file_urls && submission.file_urls.length > 0 && (
                <div className="mb-3 space-y-1.5">
                  {submission.file_urls.map((url, i) => {
                    const fileName = url.split('/').pop()?.split('_').slice(1).join('_') ?? `File ${i + 1}`;
                    return (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-[#4c1d95] hover:bg-purple-50 transition-colors">
                        <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                        <span className="truncate">{decodeURIComponent(fileName)}</span>
                        <svg className="w-3.5 h-3.5 ml-auto shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                      </a>
                    );
                  })}
                </div>
              )}

              {/* New file picker */}
              {isEditable && (
                <div className="border border-dashed border-gray-300 rounded-lg p-4 bg-gray-50">
                  {pendingFiles.length > 0 && (
                    <ul className="space-y-1.5 mb-3">
                      {pendingFiles.map((pf, idx) => (
                        <li key={idx} className="flex items-center justify-between gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                            <span className="truncate text-gray-700">{pf.name}</span>
                            <span className="text-xs text-gray-400 shrink-0">{pf.sizeKb} KB</span>
                          </div>
                          <button type="button" onClick={() => removePendingFile(idx)} className="text-gray-400 hover:text-red-500 shrink-0">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    {pendingFiles.length > 0 ? 'Add more files' : 'Attach files'}
                  </button>
                  <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFilePick} />
                </div>
              )}
            </div>

            {/* URL submission */}
            {assignment.allow_url && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">URL Submission</label>
                {isEditable ? (
                  <input
                    type="url"
                    value={urlSubmission}
                    onChange={e => { setUrlSubmission(e.target.value); scheduleDraftSave(textBody, e.target.value); }}
                    placeholder="https://github.com/your-repo or any relevant link"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4c1d95]/20"
                  />
                ) : (
                  submission?.url_submission
                    ? <a href={submission.url_submission} target="_blank" rel="noopener noreferrer" className="text-sm text-[#4c1d95] underline break-all">{submission.url_submission}</a>
                    : <span className="text-sm text-gray-400 italic">No URL submitted</span>
                )}
              </div>
            )}

            {/* Media upload */}
            {assignment.allow_media && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Media Submission (video/audio)</label>

                {submission?.media_urls && submission.media_urls.length > 0 && (
                  <div className="mb-3 space-y-1.5">
                    {submission.media_urls.map((url, i) => {
                      const fn = url.split('/').pop()?.split('_').slice(1).join('_') ?? `Media ${i + 1}`;
                      return (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-[#4c1d95] hover:bg-purple-50">
                          <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                          <span className="truncate">{decodeURIComponent(fn)}</span>
                        </a>
                      );
                    })}
                  </div>
                )}

                {isEditable && (
                  <div className="border border-dashed border-gray-300 rounded-lg p-4 bg-gray-50">
                    {pendingMedia.length > 0 && (
                      <ul className="space-y-1.5 mb-3">
                        {pendingMedia.map((mf, idx) => (
                          <li key={idx} className="flex items-center justify-between gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm">
                            <div className="flex items-center gap-2 min-w-0">
                              <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/></svg>
                              <span className="truncate text-gray-700">{mf.name}</span>
                              <span className="text-xs text-gray-400 shrink-0">{mf.sizeKb} KB</span>
                            </div>
                            <button type="button" onClick={() => removePendingMedia(idx)} className="text-gray-400 hover:text-red-500 shrink-0">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <button type="button" onClick={() => mediaInputRef.current?.click()}
                      className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                      {pendingMedia.length > 0 ? 'Add more media' : 'Attach media'}
                    </button>
                    <input ref={mediaInputRef} type="file" multiple accept="video/*,audio/*" className="hidden" onChange={handleMediaPick} />
                  </div>
                )}
              </div>
            )}

            {/* Draft save indicator */}
            {isEditable && (draftSaving || draftSavedAt) && (
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                {draftSaving
                  ? <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v8H4Z"/></svg> Saving draft…</>
                  : <><svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg> Draft saved {draftSavedAt?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</>
                }
              </div>
            )}

            {/* Plagiarism self-check */}
            {isEditable && assignment?.allow_text && (
              <div className="border border-violet-100 bg-violet-50/40 rounded-xl p-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-xs font-semibold text-violet-800 uppercase tracking-wide">Plagiarism Self-Check</p>
                  <button
                    type="button"
                    disabled={plagChecking || internetChecking || textBody.replace(/<[^>]+>/g, '').trim().length < 50}
                    title={textBody.replace(/<[^>]+>/g, '').trim().length < 50 ? 'Write at least 50 characters to check' : ''}
                    onClick={async () => {
                      setPlagChecking(true);
                      setPlagResult(null);
                      // Kick off the internet (Copyleaks) check in parallel
                      runInternetCheck();
                      try {
                        const res = await fetch('/api/plagiarism/student-check', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ assignment_id: assignment?.id, text: textBody }),
                        });
                        const data = await res.json();
                        if (res.ok) setPlagResult(data);
                        else toast.error(data.error ?? 'Plagiarism check failed');
                      } catch {
                        toast.error('Plagiarism check failed');
                      } finally {
                        setPlagChecking(false);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
                  >
                    {(plagChecking || internetChecking) ? (
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v8H4Z" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                        <path fillRule="evenodd" d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 1.06l-2.755-2.754ZM10.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" clipRule="evenodd" />
                      </svg>
                    )}
                    {(plagChecking || internetChecking) ? 'Checking…' : 'Check for Plagiarism'}
                  </button>
                </div>

                {/* Against other students (native, instant) */}
                <div className="mt-3">
                  <p className="text-xs font-semibold text-gray-600 mb-1">Against other students</p>
                  {plagChecking ? (
                    <p className="text-xs text-gray-400">Comparing with peer submissions…</p>
                  ) : plagResult ? (
                    <>
                      <div className="flex items-center gap-3 mb-1">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${plagResult.similarity_pct < 20 ? 'bg-green-100 text-green-700' : plagResult.similarity_pct < 40 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full inline-block ${plagResult.similarity_pct < 20 ? 'bg-green-500' : plagResult.similarity_pct < 40 ? 'bg-yellow-500' : 'bg-red-500'}`} />{plagResult.similarity_pct}% similar
                        </span>
                        <span className="text-xs text-gray-500">compared against {plagResult.match_count} submission{plagResult.match_count !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${plagResult.similarity_pct < 20 ? 'bg-green-400' : plagResult.similarity_pct < 40 ? 'bg-yellow-400' : 'bg-red-400'}`} style={{ width: `${Math.min(plagResult.similarity_pct, 100)}%` }} />
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-gray-400">Not checked yet.</p>
                  )}
                </div>

                {/* Against the internet (Copyleaks, async) */}
                <div className="mt-3">
                  <p className="text-xs font-semibold text-gray-600 mb-1">Against the internet &amp; published sources</p>
                  {internetChecking ? (
                    <p className="text-xs text-gray-400 flex items-center gap-1.5">
                      <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v8H4Z" /></svg>
                      Scanning the internet… this can take 1–4 minutes.
                    </p>
                  ) : internetReport?.status === 'completed' && internetReport.similarity_pct != null ? (
                    <>
                      <div className="flex items-center gap-3 mb-1">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${internetReport.similarity_pct < 20 ? 'bg-green-100 text-green-700' : internetReport.similarity_pct < 40 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full inline-block ${internetReport.similarity_pct < 20 ? 'bg-green-500' : internetReport.similarity_pct < 40 ? 'bg-yellow-500' : 'bg-red-500'}`} />{internetReport.similarity_pct}% similar
                        </span>
                        <span className="text-xs text-gray-500">via Copyleaks</span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${internetReport.similarity_pct < 20 ? 'bg-green-400' : internetReport.similarity_pct < 40 ? 'bg-yellow-400' : 'bg-red-400'}`} style={{ width: `${Math.min(internetReport.similarity_pct, 100)}%` }} />
                      </div>
                      {internetReport.source_matches && internetReport.source_matches.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {internetReport.source_matches.slice(0, 5).map((m, i) => (
                            <div key={i} className="flex items-center justify-between gap-2 text-xs">
                              {m.source_url ? (
                                <a href={m.source_url} target="_blank" rel="noopener noreferrer" className="text-violet-700 hover:underline truncate max-w-xs">{m.source_title ?? m.source_url}</a>
                              ) : (
                                <span className="text-gray-600 truncate max-w-xs">{m.source_title ?? 'External source'}</span>
                              )}
                              <span className="text-gray-400 shrink-0">{m.similarity_pct}%</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : internetReport?.status === 'failed' ? (
                    <p className="text-xs text-red-500">{internetReport.error_message ?? 'Internet check failed.'}</p>
                  ) : internetReport?.status === 'pending' ? (
                    <p className="text-xs text-amber-600">Still scanning — the result will appear in your submission report shortly after you submit.</p>
                  ) : (
                    <p className="text-xs text-gray-400">Not checked yet.</p>
                  )}
                </div>
              </div>
            )}

            {/* Error / success */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
            )}

            {/* Cannot submit notice */}
            {!canSubmit && !alreadySubmitted && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                This assignment is past due and late submissions are not allowed.
              </div>
            )}

            {/* Submit button */}
            {isEditable && !success && (
              <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#4c1d95] text-white text-sm font-semibold rounded-lg hover:bg-[#3b0764] transition-colors disabled:opacity-60"
                >
                  {submitting && (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v8H4Z" />
                    </svg>
                  )}
                  {submitting ? 'Submitting…' : needsResubmit ? 'Resubmit' : 'Submit Assignment'}
                </button>
                <p className="text-xs text-gray-400">
                  {pendingFiles.length > 0 ? `${pendingFiles.length} file(s) will be uploaded` : ''}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Plagiarism Reports (post-submission) */}
        {(submission?.status === 'submitted' || submission?.status === 'graded') && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden mt-4">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Plagiarism Check Results</h2>
                <p className="text-xs text-gray-400 mt-0.5">Native (peer comparison) + Copyleaks (internet/published sources)</p>
              </div>
              <button
                type="button"
                disabled={reportChecking}
                onClick={() => {
                  if (!submission) return;
                  setReportChecking(true);
                  fetch(`/api/plagiarism/my-report/${submission.id}`)
                    .then(r => r.json())
                    .then(d => { if (d.reports) setMyReports(d.reports); })
                    .catch(() => {})
                    .finally(() => setReportChecking(false));
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {reportChecking ? (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v8H4Z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                    <path fillRule="evenodd" d="M13.836 2.477a.75.75 0 0 1 .75.75v3.182a.75.75 0 0 1-.75.75h-3.182a.75.75 0 0 1 0-1.5h1.37l-.84-.841a4.5 4.5 0 0 0-7.08 1.011.75.75 0 1 1-1.31-.734 6 6 0 0 1 9.44-1.348l.842.841V3.227a.75.75 0 0 1 .75-.75Zm-.911 7.5A.75.75 0 0 1 13.199 11a6 6 0 0 1-9.44 1.348l-.842-.841v1.222a.75.75 0 0 1-1.5 0V9.546a.75.75 0 0 1 .75-.75h3.182a.75.75 0 0 1 0 1.5H4.013l.84.841A4.5 4.5 0 0 0 11.93 10.13a.75.75 0 0 1 .994.847Z" clipRule="evenodd" />
                  </svg>
                )}
                Refresh
              </button>
            </div>

            <div className="p-6">
              {myReports.length === 0 ? (
                <div className="text-center py-6 text-sm text-gray-400">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 mx-auto mb-2 text-gray-200">
                    <path fillRule="evenodd" d="M10.5 3.75a6.75 6.75 0 1 0 0 13.5 6.75 6.75 0 0 0 0-13.5ZM2.25 10.5a8.25 8.25 0 1 1 14.59 5.28l4.69 4.69a.75.75 0 1 1-1.06 1.06l-4.69-4.69A8.25 8.25 0 0 1 2.25 10.5Z" clipRule="evenodd" />
                  </svg>
                  No plagiarism reports yet. Reports appear automatically after submission.
                </div>
              ) : (
                <div className="space-y-3">
                  {myReports.map(report => {
                    const providerLabel = report.provider === 'copyleaks' ? 'Copyleaks (Internet)' : report.provider === 'turnitin' ? 'Turnitin' : 'Native (Peer)';
                    const providerIcon = report.provider === 'native'
                      ? <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-violet-500"><path d="M2 6.342a3.375 3.375 0 0 1 6-.003 3.375 3.375 0 0 1 6 .003C14.43 9.647 11 13.5 8 13.5S1.57 9.647 2 6.342Z"/></svg>
                      : <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-blue-500"><path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12.735 14c.618 0 1.093-.561.872-1.139a6.002 6.002 0 0 0-11.215 0c-.22.578.254 1.139.872 1.139h9.47Z"/></svg>;

                    return (
                      <div key={report.id} className="flex items-center gap-4 p-4 border border-gray-100 rounded-xl bg-gray-50/50">
                        <div className="shrink-0">{providerIcon}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-700">{providerLabel}</span>
                            {report.status === 'completed' && (
                              <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">Completed</span>
                            )}
                            {report.status === 'pending' && (
                              <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Pending</span>
                            )}
                            {report.status === 'processing' && (
                              <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">Processing</span>
                            )}
                            {report.status === 'failed' && (
                              <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">Failed</span>
                            )}
                          </div>
                          {report.status === 'completed' && report.similarity_pct != null && (
                            <div className="mt-2">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`text-sm font-bold ${report.similarity_pct < 20 ? 'text-green-600' : report.similarity_pct < 40 ? 'text-yellow-600' : 'text-red-600'}`}>
                                  {report.similarity_pct}% similar
                                </span>
                                <span className="text-xs text-gray-400">
                                  {report.similarity_pct < 20 ? 'Original' : report.similarity_pct < 40 ? 'Moderate similarity' : 'High similarity'}
                                </span>
                              </div>
                              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden w-full max-w-xs">
                                <div
                                  className={`h-full rounded-full ${report.similarity_pct < 20 ? 'bg-green-400' : report.similarity_pct < 40 ? 'bg-yellow-400' : 'bg-red-400'}`}
                                  style={{ width: `${Math.min(report.similarity_pct, 100)}%` }}
                                />
                              </div>
                            </div>
                          )}
                          {report.status === 'pending' && (
                            <p className="text-xs text-gray-400 mt-1">Analysis in progress — check back in a few minutes.</p>
                          )}
                          {report.status === 'failed' && report.error_message && (
                            <p className="text-xs text-red-500 mt-1">{report.error_message}</p>
                          )}
                          {report.completed_at && (
                            <p className="text-xs text-gray-400 mt-0.5">Checked {formatDate(report.completed_at)}</p>
                          )}
                        </div>
                        {report.provider_report_url && report.status === 'completed' && (
                          <a href={report.provider_report_url} target="_blank" rel="noopener noreferrer"
                            className="shrink-0 text-xs text-[#4c1d95] hover:underline font-medium">
                            View Report
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
