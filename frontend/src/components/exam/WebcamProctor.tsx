'use client';

import { useEffect, useRef, useState } from 'react';
import { detectFaces, captureFrame } from '@/lib/proctoring/faceDetection';
import { ViolationTracker } from '@/lib/exam/violationTracker';

interface Props {
  sessionId:        string;
  attemptId:        string;
  studentId:        string;
  stream:           MediaStream;
  tracker:          ViolationTracker;
  snapshotInterval: number; // seconds
  faceDetection:    boolean;
  audioMonitoring?: boolean;
  minimized?:       boolean;
}

export default function WebcamProctor({
  sessionId, attemptId, studentId, stream, tracker,
  snapshotInterval, faceDetection, audioMonitoring = false, minimized = false,
}: Props) {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const [faceOk, setFaceOk] = useState(true);
  const [snapCount, setSnapCount] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0); // 0-100

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  // ── Audio monitoring via Web Audio API ────────────────────────────────────
  useEffect(() => {
    if (!audioMonitoring) return;
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;

    let audioCtx: AudioContext | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let sustainedFrames = 0;

    try {
      audioCtx = new AudioContext();
      const source   = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);

      intervalId = setInterval(() => {
        analyser.getByteFrequencyData(buf);
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
        // Scale to 0-100 for display
        const level = Math.min(100, Math.round((avg / 255) * 100 * 3));
        setAudioLevel(level);

        if (avg > 18) {
          sustainedFrames++;
          // Flag after 3 consecutive seconds of elevated audio (sustained voice)
          if (sustainedFrames >= 3) {
            tracker.record('voice_detected', { level: Math.round(avg) });
            sustainedFrames = 0;
          }
        } else {
          sustainedFrames = 0;
        }
      }, 1000);
    } catch { /* AudioContext not supported — skip silently */ }

    return () => {
      if (intervalId) clearInterval(intervalId);
      audioCtx?.close().catch(() => {});
    };
  }, [audioMonitoring, stream, tracker]);

  useEffect(() => {
    const intervalMs = Math.max(10, snapshotInterval) * 1000;
    const timer = setInterval(async () => {
      if (!videoRef.current) return;

      let faceDet: boolean | undefined = undefined;
      let faceCount: number | undefined = undefined;
      let confidence: number | null = null;

      if (faceDetection) {
        const result = await detectFaces(videoRef.current);
        faceDet   = result.faceDetected;
        faceCount = result.faceCount;
        confidence = result.confidence;
        setFaceOk(result.faceDetected);

        if (!result.faceDetected) {
          tracker.record('no_face_detected', { faceCount: result.faceCount });
        } else if (result.faceCount > 1) {
          tracker.record('multiple_faces', { faceCount: result.faceCount });
        }
      }

      const imageDataUrl = captureFrame(videoRef.current);
      if (!imageDataUrl) return;

      setSnapCount(n => n + 1);
      fetch('/api/exam/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, attemptId, studentId, imageDataUrl, faceDetected: faceDet, faceCount, confidenceScore: confidence }),
      }).catch(() => {/* best-effort */});
    }, intervalMs);

    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotInterval, faceDetection]);

  if (minimized) {
    return (
      <div className="fixed bottom-4 right-4 z-30 rounded-xl overflow-hidden shadow-lg border-2 border-white w-32 bg-black" style={{ aspectRatio: '4/3' }}>
        <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
        {faceDetection && !faceOk && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-900/70">
            <span className="text-[10px] font-bold text-white text-center px-1">Face not detected</span>
          </div>
        )}
        <div className="absolute top-1 left-1 bg-red-600 w-2 h-2 rounded-full animate-pulse" title="Recording" />
        {audioMonitoring && (
          <div className="absolute bottom-1 left-1 right-1 h-1 bg-black/40 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-200 ${audioLevel > 60 ? 'bg-red-500' : audioLevel > 30 ? 'bg-amber-400' : 'bg-green-400'}`}
              style={{ width: `${audioLevel}%` }}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full rounded-xl overflow-hidden bg-black aspect-video relative">
      <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
      {faceDetection && !faceOk && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-900/70">
          <p className="text-sm font-bold text-white">Face not detected — please look at the camera</p>
        </div>
      )}
      <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-black/60 rounded-full px-2 py-1">
        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-[10px] text-white font-semibold">REC · {snapCount}</span>
      </div>
    </div>
  );
}
