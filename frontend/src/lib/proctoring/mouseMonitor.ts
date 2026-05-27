'use client';

export interface MouseMonitorCallbacks {
  onUnusualPattern: (details: Record<string, unknown>) => void;
  onInactivity: (idleSecs: number) => void;
}

interface Point { x: number; y: number; t: number }

const INACTIVITY_THRESHOLD_SECS = 120;  // 2 minutes of no interaction
const INACTIVITY_CHECK_MS       = 15_000;
const HISTORY_WINDOW_MS         = 3_000;
const MIN_MOVES_FOR_ANALYSIS    = 12;

// Detects unusual mouse patterns (erratic direction changes, suspiciously robotic movement)
// and long inactivity periods (no keyboard or mouse activity).
export class MouseMonitor {
  private history: Point[] = [];
  private lastActivity = Date.now();
  private inactivityTimer: ReturnType<typeof setInterval> | null = null;
  private callbacks: MouseMonitorCallbacks;

  private boundOnMove:    (e: MouseEvent) => void;
  private boundOnClick:   (e: MouseEvent) => void;
  private boundOnKey:     (e: KeyboardEvent) => void;

  private reportedInactivity = false;

  constructor(callbacks: MouseMonitorCallbacks) {
    this.callbacks = callbacks;
    this.boundOnMove  = this.onMove.bind(this);
    this.boundOnClick = this.onInteract.bind(this);
    this.boundOnKey   = this.onInteract.bind(this);
  }

  start() {
    document.addEventListener('mousemove',  this.boundOnMove,  { passive: true });
    document.addEventListener('click',      this.boundOnClick, { passive: true });
    document.addEventListener('keydown',    this.boundOnKey,   { passive: true });
    this.inactivityTimer = setInterval(() => this.checkInactivity(), INACTIVITY_CHECK_MS);
  }

  stop() {
    document.removeEventListener('mousemove',  this.boundOnMove);
    document.removeEventListener('click',      this.boundOnClick);
    document.removeEventListener('keydown',    this.boundOnKey);
    if (this.inactivityTimer) { clearInterval(this.inactivityTimer); this.inactivityTimer = null; }
  }

  private onMove(e: MouseEvent) {
    const now = Date.now();
    this.lastActivity = now;
    this.reportedInactivity = false;
    this.history.push({ x: e.clientX, y: e.clientY, t: now });

    // Prune old points outside the analysis window
    const cutoff = now - HISTORY_WINDOW_MS;
    this.history = this.history.filter(p => p.t >= cutoff);

    if (this.history.length >= MIN_MOVES_FOR_ANALYSIS) {
      this.analyzePattern();
    }
  }

  private onInteract(_e: Event) {
    this.lastActivity = Date.now();
    this.reportedInactivity = false;
  }

  private checkInactivity() {
    const idleSecs = Math.floor((Date.now() - this.lastActivity) / 1000);
    if (idleSecs >= INACTIVITY_THRESHOLD_SECS && !this.reportedInactivity) {
      this.reportedInactivity = true;
      this.callbacks.onInactivity(idleSecs);
    }
  }

  private analyzePattern() {
    const pts = this.history;
    if (pts.length < MIN_MOVES_FOR_ANALYSIS) return;

    let directionChanges = 0;
    let totalVelocity    = 0;
    let maxVelocity      = 0;
    let perfectLines     = 0;

    const velocities: number[] = [];

    for (let i = 1; i < pts.length; i++) {
      const dx   = pts[i].x - pts[i - 1].x;
      const dy   = pts[i].y - pts[i - 1].y;
      const dt   = Math.max(1, pts[i].t - pts[i - 1].t);
      const dist = Math.sqrt(dx * dx + dy * dy);
      const vel  = dist / dt;  // px/ms

      velocities.push(vel);
      totalVelocity += vel;
      if (vel > maxVelocity) maxVelocity = vel;

      if (i >= 2) {
        const prevDx = pts[i - 1].x - pts[i - 2].x;
        const prevDy = pts[i - 1].y - pts[i - 2].y;
        const dot    = dx * prevDx + dy * prevDy;
        const cross  = dx * prevDy - dy * prevDx;
        // Sharp direction reversal: dot < 0 AND significant magnitude
        if (dot < -5 && dist > 3) directionChanges++;
        // Suspiciously perfect straight line (cross product ≈ 0 over many points)
        if (Math.abs(cross) < 0.5 && dist > 5) perfectLines++;
      }
    }

    const avgVelocity = totalVelocity / velocities.length;
    const n = pts.length - 1;

    // Flag if >= 40% of moves are sharp reversals (extremely erratic)
    const reversalRatio = directionChanges / n;
    if (reversalRatio >= 0.4 && n >= 15) {
      this.callbacks.onUnusualPattern({
        reason: 'erratic_movement',
        reversalRatio: +reversalRatio.toFixed(2),
        avgVelocity: +avgVelocity.toFixed(3),
        sampleSize: n,
      });
      this.history = []; // reset to avoid spamming
      return;
    }

    // Flag suspiciously robotic / automated movement (near-perfect line, constant velocity)
    if (perfectLines / n > 0.85 && n >= 20) {
      const velVariance = velocities.reduce((s, v) => s + Math.pow(v - avgVelocity, 2), 0) / velocities.length;
      if (velVariance < 0.001) {
        this.callbacks.onUnusualPattern({
          reason: 'automated_movement',
          straightLineRatio: +(perfectLines / n).toFixed(2),
          velocityVariance: +velVariance.toFixed(6),
          sampleSize: n,
        });
        this.history = [];
      }
    }
  }
}
