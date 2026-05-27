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
  blockPrint:             boolean;
  blockScreenshots:       boolean;
  blockScreenRecording:   boolean;
  detectScreenShare:      boolean;
  detectExternalDisplay:  boolean;
  detectRemoteSoftware:   boolean;
  watermarkText?:         string;
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
  blockPrint,
  blockScreenshots,
  blockScreenRecording,
  detectScreenShare,
  detectExternalDisplay,
  detectRemoteSoftware,
  watermarkText,
  showWarnings,
  onViolationWarning,
  onFullscreenExit,
  children,
}: Props) {
  const periodicRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const printStyleRef = useRef<HTMLStyleElement | null>(null);
  const [mounted, setMounted]           = useState(false);
  const [windowFocused, setWindowFocused] = useState(true);

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

  // ── Window focus tracking (for screenshot blur overlay) ───────────────────
  useEffect(() => {
    if (!blockScreenshots) return;
    const onFocus = () => setWindowFocused(true);
    const onBlur  = () => setWindowFocused(false);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur',  onBlur);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur',  onBlur);
    };
  }, [blockScreenshots]);

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

  // ── Navigator clipboard API override ──────────────────────────────────────
  useEffect(() => {
    if (!blockCopyPaste) return;
    const origClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const noop = () => Promise.reject(new DOMException('NotAllowedError'));
    try {
      Object.defineProperty(navigator, 'clipboard', {
        value: { readText: noop, writeText: noop, read: noop, write: noop },
        configurable: true,
      });
    } catch { /* ignore — browser may deny redefine */ }
    const origExecCommand = document.execCommand.bind(document);
    document.execCommand = (cmd: string, ...args: unknown[]) => {
      if (['copy','cut','paste'].includes(cmd.toLowerCase())) {
        tracker?.record('clipboard_access', { cmd });
        return false;
      }
      return origExecCommand(cmd, ...(args as [boolean?, string?]));
    };
    return () => {
      document.execCommand = origExecCommand;
      if (origClipboard) {
        try { Object.defineProperty(navigator, 'clipboard', origClipboard); } catch { /* ignore */ }
      }
    };
  }, [blockCopyPaste, tracker]);

  // ── Print blocking ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!blockPrint) return;
    // Inject @media print CSS to hide all content
    const style = document.createElement('style');
    style.textContent = '@media print { body * { visibility: hidden !important; display: none !important; } }';
    document.head.appendChild(style);
    printStyleRef.current = style;

    // Override window.print
    const origPrint = window.print.bind(window);
    window.print = () => {
      tracker?.record('print_attempt', { method: 'window.print' });
      warn('Printing is not allowed during this exam.');
    };

    const onBeforePrint = () => {
      tracker?.record('print_attempt', { method: 'beforeprint' });
      warn('Printing is not allowed during this exam.');
    };
    window.addEventListener('beforeprint', onBeforePrint);

    return () => {
      window.print = origPrint;
      window.removeEventListener('beforeprint', onBeforePrint);
      if (printStyleRef.current) {
        printStyleRef.current.remove();
        printStyleRef.current = null;
      }
    };
  }, [blockPrint, tracker, warn]);

  // ── Screen recording / getDisplayMedia override ───────────────────────────
  useEffect(() => {
    if (!blockScreenRecording) return;
    if (!navigator.mediaDevices) return;
    const origGetDisplayMedia = navigator.mediaDevices.getDisplayMedia?.bind(navigator.mediaDevices);
    if (!origGetDisplayMedia) return;
    navigator.mediaDevices.getDisplayMedia = async (opts?: DisplayMediaStreamOptions) => {
      tracker?.record('screen_recording_detected', { opts: JSON.stringify(opts) });
      warn('Screen recording and sharing are not allowed during this exam.');
      throw new DOMException('Permission denied by exam security policy.', 'NotAllowedError');
    };
    return () => {
      if (origGetDisplayMedia) {
        navigator.mediaDevices.getDisplayMedia = origGetDisplayMedia;
      }
    };
  }, [blockScreenRecording, tracker, warn]);

  // ── Text selection blocking ────────────────────────────────────────────────
  useEffect(() => {
    if (!blockTextSelection) return;
    const prevent = (e: Event) => {
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

  // ── Drag attempt detection ─────────────────────────────────────────────────
  useEffect(() => {
    if (!blockTextSelection && !blockCopyPaste) return;
    const onDragStart = (e: DragEvent) => {
      e.preventDefault();
      tracker?.record('drag_attempt');
    };
    document.addEventListener('dragstart', onDragStart);
    return () => document.removeEventListener('dragstart', onDragStart);
  }, [blockTextSelection, blockCopyPaste, tracker]);

  // ── Keyboard shortcut blocking (incl. Print Screen & new tab) ─────────────
  useEffect(() => {
    if (!blockCopyPaste && !blockKeyboardShortcuts && !blockDevtools && !blockPrint && !blockScreenshots) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const ctrl  = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const key   = e.key.toLowerCase();

      // Screenshot keys
      if (blockScreenshots) {
        if (e.key === 'PrintScreen' || e.key === 'Snapshot') {
          e.preventDefault();
          tracker?.record('screenshot_attempt', { key: e.key });
          warn('Screenshots are not allowed during this exam.');
          // Immediately clear clipboard after PrtScn
          try { navigator.clipboard.writeText(''); } catch { /* ignore */ }
          return;
        }
        // Windows Snipping Tool shortcut (Win+Shift+S can't be fully blocked but we record it)
        if (e.metaKey && shift && key === 's') {
          tracker?.record('screenshot_attempt', { key: 'Win+Shift+S' });
          warn('Screenshots are not allowed during this exam.');
        }
      }

      if (blockDevtools) {
        if (e.key === 'F12' || (ctrl && shift && ['i','j','c','k'].includes(key))) {
          e.preventDefault();
          tracker?.record('keyboard_shortcut', { key: e.key });
          warn('Developer tools are disabled during this exam.');
          return;
        }
      }

      if (blockPrint) {
        if (ctrl && key === 'p') {
          e.preventDefault();
          tracker?.record('print_attempt', { key: 'Ctrl+P' });
          warn('Printing is not allowed during this exam.');
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
        // Block new tab / new window
        if (ctrl && key === 't') {
          e.preventDefault();
          tracker?.record('new_tab_attempt', { key: 'Ctrl+T' });
          return;
        }
        if (ctrl && key === 'n') {
          e.preventDefault();
          tracker?.record('new_tab_attempt', { key: 'Ctrl+N' });
          return;
        }
        if (ctrl && ['u','s','f','l'].includes(key)) {
          e.preventDefault();
          tracker?.record('keyboard_shortcut', { key: e.key });
          return;
        }
        if ((e.altKey && e.key === 'F4') || (ctrl && key === 'w')) {
          e.preventDefault();
          tracker?.record('window_close_attempt', { key: e.key });
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
  }, [blockCopyPaste, blockKeyboardShortcuts, blockDevtools, blockPrint, blockScreenshots, tracker, warn]);

  // ── beforeunload / browser exit warning ──────────────────────────────────────
  useEffect(() => {
    if (!blockTabSwitch) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Leaving this page will end your exam. Are you sure?';
      tracker?.record('browser_exit', { trigger: 'beforeunload' });
    };
    // pagehide fires even when the browser is closed or tab is killed (unlike beforeunload)
    const onPageHide = (e: PageTransitionEvent) => {
      if (!e.persisted) {
        tracker?.flush();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [blockTabSwitch, tracker]);

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
        const extended = (window.screen as unknown as { isExtended?: boolean }).isExtended;
        if (extended === true) {
          tracker?.record('external_display', { extended });
          warn('An external display has been detected. Please disconnect it.');
        }
      }
      if (detectRemoteSoftware) {
        const isWebDriver  = !!(navigator as unknown as Record<string, unknown>).webdriver;
        const hasPhantom   = !!(window as unknown as Record<string, unknown>).callPhantom || !!(window as unknown as Record<string, unknown>)._phantom;
        const isHeadless   = /HeadlessChrome|HeadlessFirefox/.test(navigator.userAgent);
        const hasSelenium  = !!(document as unknown as Record<string, unknown>).__selenium_unwrapped
                          || !!(window as unknown as Record<string, unknown>).__selenium_evaluate
                          || !!(window as unknown as Record<string, unknown>)._selenium;
        const hasNightmare = !!(window as unknown as Record<string, unknown>).__nightmare;
        const hasPlaywright = !!(window as unknown as Record<string, unknown>).__pw_manual || !!(window as unknown as Record<string, unknown>).__playwrightBinding;
        const hasCypress   = !!(window as unknown as Record<string, unknown>).Cypress;
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
  const noSelect  = blockTextSelection || blockCopyPaste;
  const wrapperCls = noSelect ? 'select-none' : '';

  const blurActive = blockScreenshots && !windowFocused;

  const blurOverlay = blurActive ? (
    <div
      className="fixed inset-0 z-[99998] backdrop-blur-xl bg-gray-900/70 flex items-center justify-center"
      style={{ pointerEvents: 'none' }}
    >
      <div className="text-white text-center px-8 py-6 rounded-xl bg-gray-800/80 shadow-2xl select-none">
        <div className="text-4xl mb-3">🔒</div>
        <p className="text-lg font-semibold">Exam Paused</p>
        <p className="text-sm text-gray-300 mt-1">Return to this window to continue your exam.</p>
      </div>
    </div>
  ) : null;

  const watermark = blockScreenshots && watermarkText ? (
    <div
      className="fixed inset-0 z-[99997] pointer-events-none overflow-hidden select-none"
      aria-hidden="true"
    >
      {Array.from({ length: 8 }).map((_, row) =>
        Array.from({ length: 5 }).map((_, col) => (
          <div
            key={`${row}-${col}`}
            className="absolute whitespace-nowrap text-gray-400/20 font-mono text-xs font-bold"
            style={{
              top:       `${row * 14 + 5}%`,
              left:      `${col * 22 - 5}%`,
              transform: 'rotate(-35deg)',
              fontSize:  '11px',
              letterSpacing: '0.05em',
            }}
          >
            {watermarkText}
          </div>
        ))
      )}
    </div>
  ) : null;

  const shouldPortal = (requireFullscreen || blockTabSwitch) && mounted;
  if (shouldPortal) {
    return createPortal(
      <div
        className={`fixed inset-0 z-[99999] bg-gray-50 overflow-y-auto ${wrapperCls}`}
        onDragStart={noSelect ? e => e.preventDefault() : undefined}
      >
        {blurOverlay}
        {watermark}
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
      {blurOverlay}
      {watermark}
      {children}
    </div>
  );
}
