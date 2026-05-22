'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { ViolationTracker } from '@/lib/exam/violationTracker';

interface Props {
  tracker:                ViolationTracker | null;
  requireFullscreen:      boolean;
  blockTabSwitch:         boolean;
  blockCopyPaste:         boolean;
  blockKeyboardShortcuts: boolean;
  blockRightClick:        boolean;
  blockTextSelection:     boolean;
  blockDevtools:          boolean;
  detectScreenShare:      boolean;
  detectExternalDisplay:  boolean;
  detectRemoteSoftware:   boolean;
  showWarnings:           boolean;
  onViolationWarning:     (msg: string) => void;
  onFullscreenExit:       () => void;
  children:               React.ReactNode;
}

export default function SecureExamShell({
  tracker,
  requireFullscreen,
  blockTabSwitch,
  blockCopyPaste,
  blockKeyboardShortcuts,
  blockRightClick,
  blockTextSelection,
  blockDevtools,
  detectScreenShare,
  detectExternalDisplay,
  detectRemoteSoftware,
  showWarnings,
  onViolationWarning,
  onFullscreenExit,
  children,
}: Props) {
  const periodicRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const [mounted, setMounted] = useState(false);
  const warn = useCallback((msg: string) => { if (showWarnings) onViolationWarning(msg); }, [showWarnings, onViolationWarning]);

  // Portal needs document — only available after mount
  useEffect(() => { setMounted(true); }, []);

  // ── Tab / window switch detection ──────────────────────────────────────────
  useEffect(() => {
    if (!blockTabSwitch) return;
    const onVisibilityChange = () => {
      if (document.hidden) {
        tracker?.record('visibility_hidden', { detail: 'Page hidden' });
        warn('Switching tabs or windows is not allowed.');
      }
    };
    const onBlur = () => { tracker?.record('window_blur'); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onBlur);
    };
  }, [blockTabSwitch, tracker, warn]);

  // ── Fullscreen enforcement (re-enter on exit) ──────────────────────────────
  useEffect(() => {
    if (!requireFullscreen) return;
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        tracker?.record('fullscreen_exit');
        warn('You must remain in fullscreen mode.');
        onFullscreenExit();
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
    const prevent = (e: ClipboardEvent) => {
      e.preventDefault();
      const type = e.type === 'copy' ? 'copy_attempt' : e.type === 'paste' ? 'paste_attempt' : 'keyboard_shortcut';
      tracker?.record(type);
      warn('Copy and paste are disabled during this exam.');
    };
    document.addEventListener('copy',  prevent as EventListener);
    document.addEventListener('cut',   prevent as EventListener);
    document.addEventListener('paste', prevent as EventListener);
    return () => {
      document.removeEventListener('copy',  prevent as EventListener);
      document.removeEventListener('cut',   prevent as EventListener);
      document.removeEventListener('paste', prevent as EventListener);
    };
  }, [blockCopyPaste, tracker, warn]);

  // ── Text selection blocking ────────────────────────────────────────────────
  useEffect(() => {
    if (!blockTextSelection) return;
    const prevent = (e: Event) => {
      // Allow selection inside answer inputs, textareas, and rich-text editors
      if ((e.target as HTMLElement).closest?.('input, textarea, [contenteditable]')) return;
      e.preventDefault();
    };
    document.addEventListener('selectstart', prevent);
    return () => document.removeEventListener('selectstart', prevent);
  }, [blockTextSelection]);

  // ── Right-click blocking ───────────────────────────────────────────────────
  useEffect(() => {
    if (!blockRightClick) return;
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      tracker?.record('right_click');
      warn('Right-click is disabled during this exam.');
    };
    document.addEventListener('contextmenu', onContextMenu);
    return () => document.removeEventListener('contextmenu', onContextMenu);
  }, [blockRightClick, tracker, warn]);

  // ── Keyboard shortcut blocking ─────────────────────────────────────────────
  useEffect(() => {
    if (!blockCopyPaste && !blockKeyboardShortcuts && !blockDevtools) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const ctrl  = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const key   = e.key.toLowerCase();

      if (blockDevtools) {
        if (e.key === 'F12' || (ctrl && shift && ['i','j','c','k'].includes(key))) {
          e.preventDefault();
          tracker?.record('keyboard_shortcut', { key: e.key });
          warn('Developer tools are disabled during this exam.');
          return;
        }
      }

      if (blockCopyPaste || blockKeyboardShortcuts) {
        if (ctrl && ['c','v','x'].includes(key)) {
          e.preventDefault();
          tracker?.record('keyboard_shortcut', { key: e.key });
          warn('Keyboard shortcuts are disabled during this exam.');
          return;
        }
        if (ctrl && key === 'p') {
          e.preventDefault();
          tracker?.record('print_attempt');
          warn('Printing is not allowed during the exam.');
          return;
        }
        if (ctrl && ['u','s','f','t','l'].includes(key)) {
          e.preventDefault();
          tracker?.record('keyboard_shortcut', { key: e.key });
          return;
        }
        if ((e.altKey && e.key === 'F4') || (ctrl && key === 'w')) {
          e.preventDefault();
          return;
        }
        if (e.key === 'F5' || (ctrl && key === 'r')) {
          e.preventDefault();
          tracker?.record('keyboard_shortcut', { key: e.key });
          return;
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [blockCopyPaste, blockKeyboardShortcuts, blockDevtools, tracker, warn]);

  // ── DevTools detection (size heuristic) ───────────────────────────────────
  useEffect(() => {
    if (!blockDevtools) return;
    const check = () => {
      const wDiff = window.outerWidth  - window.innerWidth;
      const hDiff = window.outerHeight - window.innerHeight;
      if (wDiff > 160 || hDiff > 160) {
        tracker?.record('devtools_open', { wDiff, hDiff });
        warn('Developer tools are not allowed during this exam. Please close them.');
      }
    };
    const id = setInterval(check, 2000);
    return () => clearInterval(id);
  }, [blockDevtools, tracker, warn]);

  // ── Screen sharing / external display / remote software detection ──────────
  useEffect(() => {
    if (!detectScreenShare && !detectExternalDisplay && !detectRemoteSoftware) return;
    const check = () => {
      if (detectExternalDisplay) {
        const extended = (window.screen as any).isExtended;
        if (extended === true) {
          tracker?.record('external_display', { extended });
          warn('An external display has been detected. Please disconnect it.');
        }
      }
      if (detectRemoteSoftware) {
        // Automation / headless browser fingerprints
        const isWebDriver  = !!(navigator as any).webdriver;
        const hasPhantom   = !!(window as any).callPhantom || !!(window as any)._phantom;
        const isHeadless   = /HeadlessChrome|HeadlessFirefox/.test(navigator.userAgent);
        const hasSelenium  = !!(document as any).__selenium_unwrapped
                          || !!(window as any).__selenium_evaluate
                          || !!(window as any)._selenium;
        const hasNightmare = !!(window as any).__nightmare;
        const hasPlaywright = !!(window as any).__pw_manual || !!(window as any).__playwrightBinding;
        const hasCypress   = !!(window as any).Cypress;
        // Virtual / remote display heuristic: remote desktop tools (TeamViewer,
        // AnyDesk, Chrome Remote Desktop) often expose a 1x DPR virtual display
        // with exact legacy resolutions while the OS should have HiDPI.
        const dpr = window.devicePixelRatio ?? 1;
        const suspiciousDisplay = dpr === 1 && window.screen.colorDepth < 24
          && [
            [800, 600], [1024, 768], [1280, 800], [1280, 720],
          ].some(([w, h]) => window.screen.width === w && window.screen.height === h);

        const detected = isWebDriver || hasPhantom || isHeadless || hasSelenium
                      || hasNightmare || hasPlaywright || hasCypress || suspiciousDisplay;
        if (detected) {
          tracker?.record('remote_software_detected', {
            isWebDriver, hasPhantom, isHeadless, hasSelenium,
            hasNightmare, hasPlaywright, hasCypress, suspiciousDisplay,
          });
          warn('Remote control or automation software has been detected. Please close it to continue.');
        }
      }
    };
    periodicRef.current = setInterval(check, 5000);
    check();
    return () => { if (periodicRef.current) clearInterval(periodicRef.current); };
  }, [detectScreenShare, detectExternalDisplay, detectRemoteSoftware, tracker, warn]);

  // ── Render ─────────────────────────────────────────────────────────────────
  const noSelect = blockTextSelection || blockCopyPaste;
  const wrapperCls = noSelect ? 'select-none' : '';

  // Portal the exam to document.body whenever any meaningful security is active
  // (fullscreen required OR tab-switch detection active). This bypasses the
  // dashboard layout's stacking context so the sidebar/header are covered.
  const shouldPortal = (requireFullscreen || blockTabSwitch) && mounted;
  if (shouldPortal) {
    return createPortal(
      <div
        className={`fixed inset-0 z-[99999] bg-gray-50 overflow-y-auto ${wrapperCls}`}
        onDragStart={noSelect ? e => e.preventDefault() : undefined}
      >
        {children}
      </div>,
      document.body
    );
  }

  return (
    <div
      className={wrapperCls || undefined}
      onDragStart={noSelect ? e => e.preventDefault() : undefined}
    >
      {children}
    </div>
  );
}
