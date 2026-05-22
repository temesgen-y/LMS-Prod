'use client';

import { useState, useRef, useEffect } from 'react';

type CheckStatus = 'idle' | 'checking' | 'pass' | 'fail' | 'skip';

interface Check {
  id: string;
  label: string;
  status: CheckStatus;
  detail?: string;
}

export interface ExamSecuritySettings {
  requireFullscreen:      boolean;
  blockTabSwitch:         boolean;
  blockCopyPaste:         boolean;
  blockTextSelection:     boolean;
  blockRightClick:        boolean;
  blockDevtools:          boolean;
  detectScreenShare:      boolean;
  detectExternalDisplay:  boolean;
  detectRemoteSoftware:   boolean;
  requireWebcam:          boolean;
  requireIdentityCheck:   boolean;
  faceDetectionEnabled:   boolean;
  enableAudioMonitoring:  boolean;
  showViolationWarnings:  boolean;
}

interface Props {
  assessmentTitle:  string;
  timeLimitMins:    number | null;
  totalMarks:       number;
  security:         ExamSecuritySettings;
  onReady:          (webcamStream: MediaStream | null, identityPhoto: string | null) => void;
  onCancel:         () => void;
}

export default function PreExamCheck({ assessmentTitle, timeLimitMins, totalMarks, security, onReady, onCancel }: Props) {
  const [checks, setChecks] = useState<Check[]>([]);
  const [phase, setPhase]   = useState<'checking' | 'identity' | 'rules' | 'ready'>('checking');
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const [identityPhoto, setIdentityPhoto] = useState<string | null>(null);
  const [rulesAcknowledged, setRulesAcknowledged] = useState(false);
  const [allPassed, setAllPassed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const photoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    runChecks();
    return () => { webcamStream?.getTracks().forEach(t => t.stop()); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateCheck(id: string, status: CheckStatus, detail?: string) {
    setChecks(prev => prev.map(c => c.id === id ? { ...c, status, detail } : c));
  }

  async function runChecks() {
    const initial: Check[] = [
      { id: 'browser',     label: 'Browser compatibility',   status: 'checking' },
      { id: 'js',          label: 'JavaScript enabled',       status: 'checking' },
      { id: 'fullscreen',  label: 'Fullscreen API',           status: security.requireFullscreen ? 'checking' : 'skip' },
      { id: 'webcam',      label: 'Webcam access',            status: security.requireWebcam ? 'checking' : 'skip' },
      { id: 'connectivity',label: 'Internet connectivity',    status: 'checking' },
    ];
    setChecks(initial);

    // Browser
    const isChrome = /Chrome/.test(navigator.userAgent) && !/Edg|OPR/.test(navigator.userAgent);
    const isFirefox = /Firefox/.test(navigator.userAgent);
    const isEdge = /Edg/.test(navigator.userAgent);
    updateCheck('browser', 'pass', isChrome ? 'Chrome' : isFirefox ? 'Firefox' : isEdge ? 'Edge' : 'Supported');

    // JS (trivially passes if we reach here)
    updateCheck('js', 'pass', 'Enabled');

    // Fullscreen
    if (security.requireFullscreen) {
      const fsSupported = !!(document.documentElement.requestFullscreen);
      updateCheck('fullscreen', fsSupported ? 'pass' : 'fail', fsSupported ? 'Supported' : 'Not supported by browser');
    }

    // Webcam
    let stream: MediaStream | null = null;
    if (security.requireWebcam) {
      try {
        const needsAudio = security.faceDetectionEnabled || security.enableAudioMonitoring;
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: needsAudio });
        setWebcamStream(stream);
        updateCheck('webcam', 'pass', 'Camera ready');
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); }
      } catch (err: any) {
        updateCheck('webcam', 'fail', err.name === 'NotAllowedError' ? 'Permission denied' : 'Camera not available');
      }
    }

    // Connectivity
    try {
      const r = await fetch('/api/supabase-health', { signal: AbortSignal.timeout(5000) });
      updateCheck('connectivity', r.ok ? 'pass' : 'fail', r.ok ? 'Connected' : 'Server unreachable');
    } catch {
      updateCheck('connectivity', 'fail', 'Network error');
    }

    // Determine if all required checks passed
    const finalChecks = initial.map(c => {
      if (c.id === 'browser')      return { ...c, status: 'pass' as CheckStatus };
      if (c.id === 'js')           return { ...c, status: 'pass' as CheckStatus };
      if (c.id === 'fullscreen')   return security.requireFullscreen ? c : { ...c, status: 'skip' as CheckStatus };
      if (c.id === 'webcam')       return security.requireWebcam ? (stream ? { ...c, status: 'pass' as CheckStatus } : { ...c, status: 'fail' as CheckStatus }) : { ...c, status: 'skip' as CheckStatus };
      if (c.id === 'connectivity') return c;
      return c;
    });

    const failed = finalChecks.filter(c => c.status === 'fail');
    const passed = failed.length === 0;
    setAllPassed(passed);

    setTimeout(() => {
      if (!passed) return;
      if (security.requireIdentityCheck) { setPhase('identity'); }
      else { setPhase('rules'); }
    }, 800);
  }

  function captureIdentityPhoto() {
    if (!photoRef.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    canvasRef.current.width  = photoRef.current.videoWidth  || 320;
    canvasRef.current.height = photoRef.current.videoHeight || 240;
    ctx.drawImage(photoRef.current, 0, 0);
    setIdentityPhoto(canvasRef.current.toDataURL('image/jpeg', 0.8));
  }

  function handleStart() {
    if (security.requireFullscreen && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    onReady(webcamStream, identityPhoto);
  }

  const StatusIcon = ({ status }: { status: CheckStatus }) => {
    if (status === 'checking') return <div className="w-5 h-5 rounded-full border-2 border-[#4c1d95] border-t-transparent animate-spin" />;
    if (status === 'pass')     return <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center"><svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg></div>;
    if (status === 'fail')     return <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center"><svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12"/></svg></div>;
    return <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center"><svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg></div>;
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-[#4c1d95] px-6 py-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-purple-300 mb-1">System Check</p>
          <h1 className="text-xl font-bold text-white leading-tight">{assessmentTitle}</h1>
          <div className="flex items-center gap-3 mt-2 text-purple-300 text-xs">
            {timeLimitMins && <span>{timeLimitMins} min</span>}
            <span>{totalMarks} marks</span>
          </div>
        </div>

        <div className="p-6">
          {/* Environment check phase */}
          {phase === 'checking' && (
            <>
              <h2 className="text-base font-semibold text-gray-900 mb-4">Environment Check</h2>
              <div className="space-y-3">
                {checks.map(c => (
                  <div key={c.id} className="flex items-center gap-3">
                    <StatusIcon status={c.status} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800">{c.label}</div>
                      {c.detail && <div className={`text-xs ${c.status === 'fail' ? 'text-red-500' : 'text-gray-400'}`}>{c.detail}</div>}
                    </div>
                    {c.status === 'skip' && <span className="text-xs text-gray-400 italic">Not required</span>}
                  </div>
                ))}
              </div>

              {checks.some(c => c.status === 'fail') && (
                <div className="mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                  <p className="text-sm font-semibold text-red-700 mb-1">System check failed</p>
                  <p className="text-xs text-red-600">Resolve the issues above and refresh the page, or contact your instructor.</p>
                </div>
              )}

              {security.requireWebcam && webcamStream && (
                <div className="mt-4 rounded-xl overflow-hidden bg-black aspect-video">
                  <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
                </div>
              )}

              {!allPassed && checks.some(c => c.status === 'fail') && (
                <button onClick={onCancel} className="mt-4 w-full py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">
                  Go back
                </button>
              )}
            </>
          )}

          {/* Identity verification phase */}
          {phase === 'identity' && (
            <>
              <h2 className="text-base font-semibold text-gray-900 mb-1">Identity Verification</h2>
              <p className="text-sm text-gray-500 mb-4">Take a clear photo of yourself for identity verification.</p>

              <div className="rounded-xl overflow-hidden bg-black aspect-video mb-3">
                <video
                  ref={el => {
                    if (el) { (photoRef as React.MutableRefObject<HTMLVideoElement>).current = el; el.srcObject = webcamStream; el.play().catch(() => {}); }
                  }}
                  className="w-full h-full object-cover"
                  autoPlay muted playsInline
                />
              </div>
              <canvas ref={canvasRef} className="hidden" />

              {identityPhoto ? (
                <>
                  <img src={identityPhoto} alt="Identity" className="w-full rounded-xl border border-green-300 mb-3" />
                  <div className="flex gap-2">
                    <button onClick={() => setIdentityPhoto(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">Retake</button>
                    <button onClick={() => setPhase('rules')} className="flex-1 py-2.5 rounded-xl bg-[#4c1d95] text-white text-sm font-semibold hover:opacity-90">Continue</button>
                  </div>
                </>
              ) : (
                <button onClick={captureIdentityPhoto} className="w-full py-2.5 rounded-xl bg-[#4c1d95] text-white text-sm font-semibold hover:opacity-90">
                  Take Photo
                </button>
              )}
            </>
          )}

          {/* Rules acknowledgment phase */}
          {phase === 'rules' && (
            <>
              <h2 className="text-base font-semibold text-gray-900 mb-3">Exam Rules</h2>
              <div className="space-y-2 text-sm text-gray-700 mb-4">
                {security.requireFullscreen     && <Rule icon="⛶" text="The exam must be taken in fullscreen mode." />}
                {security.blockTabSwitch        && <Rule icon="🚫" text="Switching tabs or windows will be recorded as a violation." />}
                {security.blockCopyPaste        && <Rule icon="📋" text="Copying and pasting is disabled during the exam." />}
                {security.blockTextSelection    && <Rule icon="✋" text="Text selection is disabled during the exam." />}
                {security.blockRightClick       && <Rule icon="🖱" text="Right-click is disabled during the exam." />}
                {security.blockDevtools         && <Rule icon="🔧" text="Browser developer tools are blocked." />}
                {security.detectScreenShare     && <Rule icon="🖥" text="Screen sharing detection is active." />}
                {security.detectExternalDisplay && <Rule icon="📺" text="External display detection is active. Disconnect any secondary monitors." />}
                {security.detectRemoteSoftware  && <Rule icon="🔒" text="Remote control software detection is active." />}
                {security.requireWebcam           && <Rule icon="📷" text="Your webcam will be active throughout the exam." />}
                {security.faceDetectionEnabled   && <Rule icon="👤" text="Face detection is active — ensure your face is visible." />}
                {security.enableAudioMonitoring  && <Rule icon="🎤" text="Audio monitoring is active — unexpected voices will be flagged." />}
                <Rule icon="⏰" text="Your exam will be automatically submitted when time expires." />
                <Rule icon="⚠️" text="Violations are logged and reported to your instructor." />
              </div>

              <label className="flex items-start gap-3 cursor-pointer mb-4">
                <input type="checkbox" checked={rulesAcknowledged} onChange={e => setRulesAcknowledged(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 accent-[#4c1d95]" />
                <span className="text-sm text-gray-700">I have read and agree to follow the exam rules.</span>
              </label>

              <div className="flex gap-2">
                <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
                <button disabled={!rulesAcknowledged} onClick={handleStart}
                  className="flex-1 py-2.5 rounded-xl bg-[#4c1d95] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-40">
                  Start Exam
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Rule({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-base leading-snug flex-shrink-0">{icon}</span>
      <span className="leading-snug">{text}</span>
    </div>
  );
}
