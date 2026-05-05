'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Certificate = {
  id: string;
  uniqueCode: string;
  courseCode: string;
  courseTitle: string;
  issuedAt: string;
  expiresAt: string | null;
  pdfUrl: string | null;
  isRevoked: boolean;
};

export default function CertificatesPage() {
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { setLoading(false); return; }

      const { data: appUser } = await supabase
        .from('users').select('id').eq('auth_user_id', authData.user.id).single();
      if (!appUser) { setLoading(false); return; }

      const { data: rows } = await supabase
        .from('certificates')
        .select(`
          id, unique_code, issued_at, expires_at, pdf_url, revoked_at,
          offering_id,
          course_offerings!fk_certificates_offering(
            courses!fk_course_offerings_course(code, title)
          )
        `)
        .eq('student_id', (appUser as { id: string }).id)
        .order('issued_at', { ascending: false });

      setCerts((rows ?? []).map((r: any) => ({
        id:          r.id,
        uniqueCode:  r.unique_code,
        courseCode:  r.course_offerings?.courses?.code ?? '—',
        courseTitle: r.course_offerings?.courses?.title ?? '—',
        issuedAt:    r.issued_at,
        expiresAt:   r.expires_at,
        pdfUrl:      r.pdf_url,
        isRevoked:   !!r.revoked_at,
      })));
      setLoading(false);
    };
    load();
  }, []);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl" aria-hidden>🏆</span>
          <h1 className="text-2xl font-bold text-gray-900">Certificates</h1>
        </div>
        <p className="text-sm text-gray-500 mb-8">Certificates are issued upon successful course completion.</p>

        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading certificates…</div>
        ) : certs.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center">
            <span className="text-5xl block mb-4">🎓</span>
            <p className="text-gray-500 font-medium">No certificates yet</p>
            <p className="text-gray-400 text-sm mt-1">Complete a course to earn your first certificate.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {certs.map(c => (
              <div
                key={c.id}
                className={`bg-white rounded-2xl border overflow-hidden shadow-sm ${
                  c.isRevoked ? 'border-red-200 opacity-60' : 'border-gray-200'
                }`}
              >
                {/* Gold accent bar */}
                <div className={`h-2 ${c.isRevoked ? 'bg-red-300' : 'bg-gradient-to-r from-yellow-400 to-amber-500'}`} />
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <span className="inline-block px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-xs font-medium mb-2">
                        {c.courseCode}
                      </span>
                      <h3 className="font-bold text-gray-900 leading-snug">{c.courseTitle}</h3>
                      <p className="text-xs text-gray-500 mt-1 font-mono">{c.uniqueCode}</p>
                    </div>
                    {!c.isRevoked && (
                      <span className="text-3xl mt-1">🏆</span>
                    )}
                    {c.isRevoked && (
                      <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded">REVOKED</span>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
                    <div>
                      <p>Issued: <span className="text-gray-700 font-medium">{new Date(c.issuedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></p>
                      {c.expiresAt && (
                        <p className="mt-0.5">Expires: <span className="text-amber-700 font-medium">{new Date(c.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></p>
                      )}
                      <a
                        href={`/verify/${c.uniqueCode}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block text-indigo-500 hover:underline"
                      >
                        Verify certificate
                      </a>
                    </div>
                    {c.pdfUrl && !c.isRevoked && (
                      <a
                        href={c.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#4c1d95] hover:bg-[#5b21b6] text-white text-xs font-medium transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                          <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
                          <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
                        </svg>
                        Download PDF
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
