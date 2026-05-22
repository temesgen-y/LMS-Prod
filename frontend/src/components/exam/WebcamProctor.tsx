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
  minimized?:       boolean;
}

export default function WebcamProctor({
  sessionId, attemptId, studentId, stream, tracker,
  snapshotInterval, faceDetection, minimized = false,
}: Props) {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const [faceOk, setFaceOk] = useState(true);
  const [snapCount, setSnapCount] = useState(0);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

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
      <div className="fixed bottom-4 right-4 z-30 rounded-xl overflow-hidden shadow-lg border-2 border-white w-32 aspect-video bg-black">
        <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
        {faceDetection && !faceOk && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-900/70">
            <span className="text-[10px] font-bold text-white text-center px-1">Face not detected</span>
          </div>
        )}
        <div className="absolute top-1 left-1 bg-red-600 w-2 h-2 rounded-full animate-pulse" title="Recording" />
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
