'use client';

import { useEffect, useState, useRef } from 'react';

interface Props {
  initialSeconds:  number;
  sessionId:       string | null;
  onExpire:        () => void;
  onTick?:         (remaining: number) => void;
}

function formatTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

export default function ExamTimer({ initialSeconds, sessionId, onExpire, onTick }: Props) {
  const [remaining, setRemaining] = useState(initialSeconds);
  const expiredRef = useRef(false);
  const syncTimer  = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setRemaining(initialSeconds);
    expiredRef.current = false;
  }, [initialSeconds]);

  useEffect(() => {
    if (remaining <= 0) return;
    const tick = setInterval(() => {
      setRemaining(prev => {
        const next = prev - 1;
        onTick?.(next);
        if (next <= 0 && !expiredRef.current) {
          expiredRef.current = true;
          clearInterval(tick);
          onExpire();
        }
        return Math.max(0, next);
      });
    }, 1000);
    return () => clearInterval(tick);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync with server every 60s to prevent client-side drift
  useEffect(() => {
    if (!sessionId) return;
    syncTimer.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/exam/session/${sessionId}`, {
          headers: { 'Content-Type': 'application/json' },
        });
        // Server doesn't return remaining time currently — placeholder for future authoritative sync
        if (!res.ok) return;
      } catch { /* best-effort */ }
    }, 60_000);
    return () => { if (syncTimer.current) clearInterval(syncTimer.current); };
  }, [sessionId]);

  const urgent  = remaining <= 120; // under 2 minutes
  const warning = remaining <= 300; // under 5 minutes

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full font-mono text-sm font-bold transition-colors ${
      urgent
        ? 'bg-red-100 text-red-700 border border-red-300 animate-pulse'
        : warning
          ? 'bg-amber-100 text-amber-700 border border-amber-300'
          : 'bg-purple-50 text-[#4c1d95] border border-purple-200'
    }`}>
      {urgent ? '⏰' : '🕐'} {formatTime(remaining)}
    </div>
  );
}
