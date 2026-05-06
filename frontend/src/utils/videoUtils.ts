export const extractYoutubeId = (url: string): string | null => {
  if (!url) return null;
  const patterns = [
    /youtube\.com\/watch\?.*v=([^&\s]+)/,
    /youtu\.be\/([^?&\s]+)/,
    /youtube\.com\/embed\/([^?&\s]+)/,
    /youtube-nocookie\.com\/embed\/([^?&\s]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
};

export const buildSafeYoutubeUrl = (videoId: string): string => {
  // showinfo=0 is deprecated and removed by YouTube — do NOT use it
  // Use youtube-nocookie.com which strips tracking and reduces branding
  const params = [
    'rel=0',            // no related videos at end
    'modestbranding=1', // minimal YouTube branding
    'iv_load_policy=3', // no annotations/cards
    'controls=1',       // keep play/pause/volume controls
    'playsinline=1',    // play inline on mobile (no fullscreen auto)
  ].join('&');

  return `https://www.youtube-nocookie.com/embed/${videoId}?${params}`;
};

export const isYoutubeUrl = (url: string): boolean =>
  url.includes('youtube.com') ||
  url.includes('youtu.be') ||
  url.includes('youtube-nocookie.com');

/**
 * Preprocesses rich-text HTML (from the editor) before it is rendered.
 * Finds every YouTube iframe, rewrites its src to a safe nocookie URL,
 * removes its fixed width/height attributes, and wraps it in a
 * 16:9 container with black overlay divs that physically hide the
 * "Copy link" and "Watch on YouTube" buttons.
 *
 * Uses DOMParser so it runs entirely in the browser with no timing
 * issues and no z-index battles — the protection is baked into the
 * HTML string before React renders it.
 */
export const preprocessRichTextHtml = (html: string): string => {
  if (typeof window === 'undefined' || !html) return html;

  const doc = new DOMParser().parseFromString(html, 'text/html');

  doc.querySelectorAll<HTMLIFrameElement>('iframe').forEach(iframe => {
    const src = iframe.getAttribute('src') ?? '';
    if (!isYoutubeUrl(src)) return;

    const videoId = extractYoutubeId(src);
    if (!videoId) return;

    // Rewrite src — safe nocookie URL with correct params
    iframe.setAttribute('src', buildSafeYoutubeUrl(videoId));
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    // Remove fixed pixel dimensions — wrapper controls sizing
    iframe.removeAttribute('width');
    iframe.removeAttribute('height');
    iframe.setAttribute(
      'style',
      'position:absolute;top:0;left:0;width:100%;height:100%;border:none;',
    );

    // 16:9 wrapper using the padding-bottom trick (works in all browsers)
    const wrapper = doc.createElement('div');
    wrapper.setAttribute('class', 'yt-protected');
    wrapper.setAttribute(
      'style',
      'position:relative;width:100%;padding-bottom:56.25%;background:#000;border-radius:12px;overflow:hidden;margin:8px 0;',
    );

    // Black overlay — top bar: hides "Copy link" + title link.
    // 80px covers the full YouTube title bar including the hover-state button.
    // No pointer-events override = auto, so clicks here land in the parent
    // page and show the browser's plain context menu, not YouTube's.
    const top = doc.createElement('div');
    top.setAttribute(
      'style',
      'position:absolute;top:0;left:0;right:0;height:80px;background:#000;z-index:10;cursor:default;',
    );

    // Black overlay — bottom left: hides "Watch on YouTube"
    const botL = doc.createElement('div');
    botL.setAttribute(
      'style',
      'position:absolute;bottom:0;left:0;width:240px;height:48px;background:#000;z-index:10;cursor:default;',
    );

    // Black overlay — bottom right: hides YouTube logo button.
    // Controls bar from right: [Fullscreen ~36px][Settings ~36px][YT-logo ~36px]
    // 200px covers all three.
    const botR = doc.createElement('div');
    botR.setAttribute(
      'style',
      'position:absolute;bottom:0;right:0;width:200px;height:56px;background:#000;z-index:10;cursor:default;',
    );

    iframe.parentNode?.insertBefore(wrapper, iframe);
    wrapper.appendChild(iframe);
    wrapper.appendChild(top);
    wrapper.appendChild(botL);
    wrapper.appendChild(botR);
  });

  // Disable plain YouTube anchor links
  doc.querySelectorAll<HTMLAnchorElement>('a').forEach(a => {
    if (/youtube\.com|youtu\.be/.test(a.getAttribute('href') ?? '')) {
      a.removeAttribute('href');
      a.setAttribute(
        'style',
        'cursor:default;color:inherit;text-decoration:none;pointer-events:none;',
      );
    }
  });

  return doc.body.innerHTML;
};
