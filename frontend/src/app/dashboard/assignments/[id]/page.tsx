'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import RichTextEditor from '@/components/shared/RichTextEditor';

type AssignmentDetail = {
  id: string;
  title: string;
  brief: string | null;
  due_date: string;
  max_score: number;
  allow_files: boolean;
  allow_text: boolean;
  late_allowed: boolean;
  offering_id: string;
  course_name: string;
};

type Submission = {
  id: string;
  text_body: string | null;
  file_urls: string[] | null;
  status: string;
  submitted_at: string;
  score: number | null;
  final_score: number | null;
  feedback: string | null;
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
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [success, setSuccess]         = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        .select(`id, title, brief, due_date, max_score, allow_files, allow_text, late_allowed, offering_id, course_offerings(courses(title))`)
        .eq('id', id)
        .single();

      if (!asgn) { setLoading(false); return; }
      setAssignment({
        id: asgn.id, title: asgn.title, brief: asgn.brief, due_date: asgn.due_date,
        max_score: asgn.max_score, allow_files: asgn.allow_files, allow_text: asgn.allow_text,
        late_allowed: asgn.late_allowed, offering_id: asgn.offering_id,
        course_name: (asgn as any).course_offerings?.courses?.title ?? 'Unknown Course',
      });

      const { data: enrollment } = await supabase
        .from('enrollments').select('id').eq('student_id', profile.id)
        .eq('offering_id', asgn.offering_id).eq('status', 'active').single();
      if (enrollment) setEnrollmentId(enrollment.id);

      const { data: sub } = await supabase
        .from('assignment_submissions')
        .select('id, text_body, file_urls, status, submitted_at, score, final_score, feedback')
        .eq('assignment_id', id).eq('student_id', profile.id).maybeSingle();
      if (sub) { setSubmission(sub); setTextBody(sub.text_body ?? ''); }

      setLoading(false);
    })();
  }, [id]);

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    setPendingFiles(prev => [...prev, ...picked.map(f => ({ file: f, name: f.name, sizeKb: Math.ceil(f.size / 1024) }))]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  const removePendingFile = (idx: number) => setPendingFiles(prev => prev.filter((_, i) => i !== idx));

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
    if (!hasText && !hasFiles) {
      setError('Please write a response or attach at least one file.');
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

    const allFileUrls = [...(submission?.file_urls ?? []), ...newFileUrls];

    const payload: Record<string, unknown> = {
      assignment_id: assignment.id, student_id: userId, enrollment_id: enrollmentId,
      is_late: isLate, status: 'submitted', submitted_at: now.toISOString(),
      text_body: hasText ? textBody : null,
      file_urls: allFileUrls.length > 0 ? allFileUrls : null,
    };

    if (submission) {
      const { error: updateError } = await supabase.from('assignment_submissions').update(payload).eq('id', submission.id);
      if (updateError) { setError(updateError.message); setSubmitting(false); return; }
    } else {
      const { error: insertError } = await supabase.from('assignment_submissions').insert(payload);
      if (insertError) { setError(insertError.message); setSubmitting(false); return; }
    }

    setSuccess(true);
    setPendingFiles([]);
    setSubmitting(false);

    const { data: sub } = await supabase
      .from('assignment_submissions')
      .select('id, text_body, file_urls, status, submitted_at, score, final_score, feedback')
      .eq('assignment_id', id).eq('student_id', userId).maybeSingle();
    if (sub) setSubmission(sub);
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
  const isEditable       = canSubmit || needsResubmit;
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
          <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-4">
            <h2 className="text-sm font-semibold text-green-800 mb-2 uppercase tracking-wide">Grade</h2>
            <p className="text-3xl font-bold text-green-700">
              {submission!.final_score ?? submission!.score}
              <span className="text-lg font-normal text-green-600 ml-1">/ {assignment.max_score}</span>
            </p>
            {submission!.feedback && (
              <div className="mt-3 text-sm text-green-800">
                <span className="font-medium">Instructor Feedback: </span>{submission!.feedback}
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
                  onChange={html => setTextBody(html)}
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

            {/* Error / success */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
            )}
            {success && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                Assignment submitted successfully!
              </div>
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
                  {submitting ? 'Submitting…' : alreadySubmitted ? 'Resubmit' : 'Submit Assignment'}
                </button>
                <p className="text-xs text-gray-400">
                  {pendingFiles.length > 0 ? `${pendingFiles.length} file(s) will be uploaded` : ''}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
