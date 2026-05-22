'use client';

export interface SessionSecurityConfig {
  sessionId: string;
  attemptId: string;
  onHeartbeatFail?: () => void;
}

export class SessionSecurity {
  private config: SessionSecurityConfig;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private missedHeartbeats = 0;
  private readonly HEARTBEAT_INTERVAL_MS = 15_000;
  private readonly MAX_MISSED = 4;
  private riskScore = 0;
  private tabSwitches = 0;
  private fullscreenExits = 0;
  private focusLosses = 0;

  constructor(config: SessionSecurityConfig) {
    this.config = config;
  }

  start() {
    this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), this.HEARTBEAT_INTERVAL_MS);
    this.sendHeartbeat();
  }

  updateCounters(p: { riskScore?: number; tabSwitches?: number; fullscreenExits?: number; focusLosses?: number }) {
    if (p.riskScore      !== undefined) this.riskScore       = p.riskScore;
    if (p.tabSwitches    !== undefined) this.tabSwitches     = p.tabSwitches;
    if (p.fullscreenExits !== undefined) this.fullscreenExits = p.fullscreenExits;
    if (p.focusLosses    !== undefined) this.focusLosses     = p.focusLosses;
  }

  private async sendHeartbeat() {
    try {
      const res = await fetch('/api/exam/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId:      this.config.sessionId,
          riskScore:      this.riskScore,
          tabSwitches:    this.tabSwitches,
          fullscreenExits: this.fullscreenExits,
          focusLosses:    this.focusLosses,
        }),
      });
      if (res.ok) { this.missedHeartbeats = 0; } else { this.missedHeartbeats++; }
    } catch {
      this.missedHeartbeats++;
    }

    if (this.missedHeartbeats >= this.MAX_MISSED) {
      this.config.onHeartbeatFail?.();
    }
  }

  async endSession(status: 'submitted' | 'timed_out' | 'terminated') {
    this.stop();
    try {
      await fetch(`/api/exam/session/${this.config.attemptId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
    } catch { /* best-effort */ }
  }

  stop() {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
  }
}
