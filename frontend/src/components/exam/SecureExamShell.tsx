'use client';

import { useEffect, useRef, useCallback } from 'react';
import { ViolationTracker } from '@/lib/exam/violationTracker';

interface Props {
  tracker:             ViolationTracker | null;
  requireFullscreen:   boolean;
  blockTabSwitch:      boolean;
  blockCopyPaste:      boolean;
  blockRightClick:     boolean;
  blockDevtools:       boolean;
  showWarnings:        boolean;
  onViolationWarning:  (msg: string) => void;
  onFullscreenExit:    () => void;
  children:            React.ReactNode;
}

export default function SecureExamShell({
  tracker,
  requireFullscreen,
  blockTabSwitch,
  blockCopyPaste,
  blockRightClick,
  blockDevtools,
  showWarnings,
  onViolationWarning,
  onFullscreenExit,
  children,
}: Props) {
  const devtoolsCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const warn = useCallback((msg: string) => { if (showWarnings) onViolationWarning(msg); }, [showWarnings, onViolationWarning]);

  // ── Tab / window switch detection ──────────────────────────────────────────
  useEffect(() => {
    if (!blockTabSwitch) return;

    const onVisibilityChange = () => {
      if (document.hidden) {
        tracker?.record('visibility_hidden', { detail: 'Page hidden' });
        warn('Switching tabs or windows is not allowed.');
      }
    };
    const onBlur = () => {
      tracker?.record('window_blur');
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onBlur);
    };
  }, [blockTabSwitch, tracker, warn]);

  // ── Fullscreen enforcement ─────────────────────────────────────────────────
  useEffect(() => {
    if (!requireFullscreen) return;

    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        tracker?.record('fullscreen_exit');
        warn('You must remain in fullscreen mode.');
        onFullscreenExit();
        // Re-request fullscreen after short delay
        setTimeout(() => {
          document.documentElement.requestFullscreen?.().catch(() => {});
        }, 1500);
      }
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, [requireFullscreen, tracker, warn, onFullscreenExit]);

  // ── Copy / paste / cut blocking ────────────────────────────────────────────
  useEffect(() => {
    if (!blockCopyPaste) return;

    const preventDefault = (e: ClipboardEvent) => {
      e.preventDefault();
      const type = e.type === 'copy' ? 'copy_attempt' : e.type === 'paste' ? 'paste_attempt' : 'keyboard_shortcut';
      tracker?.record(type);
      warn('Copy and paste are disabled during this exam.');
    };

    document.addEventListener('copy',  preventDefault as EventListener);
    document.addEventListener('cut',   preventDefault as EventListener);
    document.addEventListener('paste', preventDefault as EventListener);
    return () => {
      document.removeEventListener('copy',  preventDefault as EventListener);
      document.removeEventListener('cut',   preventDefault as EventListener);
      document.removeEventListener('paste', preventDefault as EventListener);
    };
  }, [blockCopyPaste, tracker, warn]);

  // ── Right-click blocking ───────────────────────────────────────────────────
  useEffect(() => {
    if (!blockRightClick) return;
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      tracker?.record('right_click');
    };
    document.addEventListener('contextmenu', onContextMenu);
    return () => document.removeEventListener('contextmenu', onContextMenu);
  }, [blockRightClick, tracker]);

  // ── Keyboard shortcut blocking ─────────────────────────────────────────────
  useEffect(() => {
    const BLOCKED: string[] = [
      'F12', 'F5',
      // Ctrl+C/V/X/U/S/P/A/F
      ...['c','v','x','u','s','p','a','f'].map(k => `ctrl+${k}`),
      ...['c','v','x','u','s','p','a','f'].map(k => `meta+${k}`),
      'ctrl+shift+i', 'ctrl+shift+j', 'ctrl+shift+c',
      'meta+shift+i', 'meta+shift+j', 'meta+shift+c',
      'ctrl+shift+k',
    ];

    const onKeyDown = (e: KeyboardEvent) => {
      const ctrl  = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const key   = e.key.toLowerCase();

      // Always block F12 and DevTools combos if blockDevtools is on
      if (blockDevtools) {
        if (e.key === 'F12' || (ctrl && shift && ['i','j','c','k'].includes(key))) {
          e.preventDefault();
          tracker?.record('keyboard_shortcut', { key: e.key });
          warn('Developer tools are disabled during this exam.');
          return;
        }
      }

      if (!blockCopyPaste) return;
      if (ctrl && ['c','v','x','a'].includes(key)) {
        if (key === 'a') return; // allow select-all
        e.preventDefault();
        tracker?.record('keyboard_shortcut', { key: e.key });
        warn('Copy and paste are disabled.');
      }

      // Block print
      if (ctrl && key === 'p') {
        e.preventDefault();
        tracker?.record('print_attempt');
        warn('Printing is not allowed during the exam.');
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [blockCopyPaste, blockDevtools, tracker, warn]);

  // ── DevTools detection (size heuristic) ───────────────────────────────────
  useEffect(() => {
    if (!blockDevtools) return;

    const check = () => {
      const threshold = 160;
      const widthDiff  = window.outerWidth  - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;
      if (widthDiff > threshold || heightDiff > threshold) {
        tracker?.record('devtools_open', { widthDiff, heightDiff });
        warn('Developer tools are not allowed during this exam. Please close them.');
      }
    };

    devtoolsCheckRef.current = setInterval(check, 2000);
    return () => { if (devtoolsCheckRef.current) clearInterval(devtoolsCheckRef.current); };
  }, [blockDevtools, tracker, warn]);

  // ── Text selection blocking ────────────────────────────────────────────────
  return (
    <div
      className={`${blockCopyPaste ? 'select-none' : ''}`}
      onDragStart={blockCopyPaste ? e => e.preventDefault() : undefined}
    >
      {children}
    </div>
  );
}
