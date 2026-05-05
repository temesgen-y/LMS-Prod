import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type CertData = {
  unique_code: string;
  issued_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
  pdf_url: string | null;
  studentName: string;
  courseCode: string;
  courseTitle: string;
};

export default async function VerifyCertificatePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('certificates')
    .select(`
      unique_code, issued_at, expires_at, revoked_at, revoke_reason, pdf_url,
      users!fk_certificates_student(first_name, last_name),
      course_offerings!fk_certificates_offering(
        courses!fk_course_offerings_course(code, title)
      )
    `)
    .eq('unique_code', code)
    .maybeSingle();

  let cert: CertData | null = null;
  if (!error && data) {
    const d = data as any;
    cert = {
      unique_code:   d.unique_code,
      issued_at:     d.issued_at,
      expires_at:    d.expires_at,
      revoked_at:    d.revoked_at,
      revoke_reason: d.revoke_reason,
      pdf_url:       d.pdf_url,
      studentName:   `${d.users.first_name} ${d.users.last_name}`,
      courseCode:    d.course_offerings?.courses?.code  ?? '—',
      courseTitle:   d.course_offerings?.courses?.title ?? '—',
    };
  }

  const isRevoked  = !!cert?.revoked_at;
  const isExpired  = cert?.expires_at ? new Date(cert.expires_at) < new Date() : false;
  const isValid    = !!cert && !isRevoked && !isExpired;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">

        {/* Brand header */}
        <div className="text-center mb-8">
          <p className="text-sm font-semibold text-gray-700">Mule University</p>
          <p className="text-xs text-gray-400 mt-0.5">Certificate Verification Portal</p>
        </div>

        {!cert ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 text-center">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-gray-900 mb-2">Certificate Not Found</h1>
            <p className="text-sm text-gray-500 mb-4">
              No certificate matching code
            </p>
            <code className="text-xs font-mono bg-gray-100 px-2 py-1 rounded text-gray-700 break-all">
              {code}
            </code>
            <p className="text-xs text-gray-400 mt-4">
              Please verify the code and try again, or contact your institution.
            </p>
          </div>
        ) : (
          <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${
            isValid ? 'border-green-200' : 'border-red-200'
          }`}>
            {/* Status bar */}
            <div className={`h-1.5 ${isValid
              ? 'bg-gradient-to-r from-green-400 to-emerald-500'
              : 'bg-red-400'}`}
            />

            <div className="p-8">
              {/* Status badge */}
              <div className="flex items-center gap-3 mb-7">
                {isValid ? (
                  <>
                    <div className="w-11 h-11 bg-green-50 rounded-full flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-bold text-green-700 leading-tight">Valid Certificate</p>
                      <p className="text-xs text-gray-400 mt-0.5">Authentic and currently active</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-11 h-11 bg-red-50 rounded-full flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-bold text-red-700 leading-tight">
                        {isRevoked ? 'Certificate Revoked' : 'Certificate Expired'}
                      </p>
                      {isRevoked && cert.revoke_reason && (
                        <p className="text-xs text-gray-400 mt-0.5">Reason: {cert.revoke_reason}</p>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Details */}
              <div className="space-y-5 border-t border-gray-100 pt-6">
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Awarded to</p>
                  <p className="text-xl font-bold text-gray-900">{cert.studentName}</p>
                </div>

                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Course completed</p>
                  <p className="font-semibold text-gray-800 leading-snug">{cert.courseTitle}</p>
                  <p className="text-sm text-gray-400 font-mono mt-0.5">{cert.courseCode}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Date issued</p>
                    <p className="text-sm text-gray-700">
                      {new Date(cert.issued_at).toLocaleDateString('en-US', {
                        month: 'long', day: 'numeric', year: 'numeric',
                      })}
                    </p>
                  </div>
                  {cert.expires_at && (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Valid until</p>
                      <p className={`text-sm font-medium ${isExpired ? 'text-red-600' : 'text-gray-700'}`}>
                        {new Date(cert.expires_at).toLocaleDateString('en-US', {
                          month: 'long', day: 'numeric', year: 'numeric',
                        })}
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Certificate code</p>
                  <code className="text-sm font-mono bg-gray-50 border border-gray-200 px-2 py-1 rounded text-gray-700">
                    {cert.unique_code}
                  </code>
                </div>
              </div>

              {/* PDF download */}
              {cert.pdf_url && isValid && (
                <div className="mt-6 pt-5 border-t border-gray-100">
                  <a
                    href={cert.pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
                    style={{ backgroundColor: '#152249' }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Download Certificate PDF
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        <p className="text-center text-xs text-gray-400 mt-6">
          Issued by Mule University Learning Management System
        </p>
      </div>
    </div>
  );
}
