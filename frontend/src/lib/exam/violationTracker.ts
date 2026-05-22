'use client';

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export interface ViolationEvent {
  violationType: string;
  severity: Severity;
  riskPoints: number;
  details?: Record<string, unknown>;
  timestamp: number;
}

export interface ViolationTrackerConfig {
  sessionId: string;
  attemptId: string;
  studentId: string;
  assessmentId: string;
  violationThreshold: number;
  autoSubmitOnViolation: boolean;
  onThresholdExceeded?: () => void;
  onViolation?: (event: ViolationEvent, totalRisk: number) => void;
}

const RISK_POINTS: Record<string, { severity: Severity; points: number }> = {
  tab_switch:          { severity: 'medium',   points: 15 },
  window_blur:         { severity: 'low',      points: 5  },
  fullscreen_exit:     { severity: 'medium',   points: 20 },
  copy_attempt:        { severity: 'high',     points: 25 },
  paste_attempt:       { severity: 'high',     points: 25 },
  right_click:         { severity: 'low',      points: 5  },
  devtools_open:       { severity: 'critical', points: 40 },
  no_face_detected:    { severity: 'high',     points: 30 },
  multiple_faces:      { severity: 'critical', points: 35 },
  print_attempt:       { severity: 'high',     points: 30 },
  keyboard_shortcut:   { severity: 'medium',   points: 10 },
  visibility_hidden:   { severity: 'medium',   points: 15 },
  identity_mismatch:   { severity: 'critical', points: 50 },
};

export class ViolationTracker {
  private config: ViolationTrackerConfig;
  private queue: ViolationEvent[] = [];
  private totalRisk = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly FLUSH_INTERVAL_MS = 3000;
  private readonly MAX_QUEUE = 20;

  constructor(config: ViolationTrackerConfig) {
    this.config = config;
  }

  record(violationType: string, details?: Record<string, unknown>) {
    const rule = RISK_POINTS[violationType] ?? { severity: 'low' as Severity, points: 5 };
    const event: ViolationEvent = {
      violationType,
      severity:   rule.severity,
      riskPoints: rule.points,
      details,
      timestamp:  Date.now(),
    };

    this.queue.push(event);
    this.totalRisk += rule.points;
    this.config.onViolation?.(event, this.totalRisk);

    if (
      this.config.autoSubmitOnViolation &&
      this.totalRisk >= this.config.violationThreshold
    ) {
      this.flush();
      this.config.onThresholdExceeded?.();
      return;
    }

    if (this.queue.length >= this.MAX_QUEUE) {
      this.flush();
    } else {
      this.scheduleFlush();
    }
  }

  getTotalRisk(): number { return this.totalRisk; }
  getQueue(): ViolationEvent[] { return [...this.queue]; }

  private scheduleFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => { this.flushTimer = null; this.flush(); }, this.FLUSH_INTERVAL_MS);
  }

  flush() {
    if (this.flushTimer) { clearTimeout(this.flushTimer); this.flushTimer = null; }
    const batch = this.queue.splice(0);
    if (batch.length === 0) return;
    this.sendBatch(batch);
  }

  private async sendBatch(violations: ViolationEvent[]) {
    try {
      await fetch('/api/exam/violations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId:    this.config.sessionId,
          attemptId:    this.config.attemptId,
          studentId:    this.config.studentId,
          assessmentId: this.config.assessmentId,
          violations,
        }),
      });
    } catch {
      // Network error — re-queue silently
      this.queue.unshift(...violations);
    }
  }

  destroy() {
    this.flush();
  }
}
