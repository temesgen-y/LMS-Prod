import { extractYoutubeId, buildSafeYoutubeUrl, isYoutubeUrl } from './videoUtils';

/**
 * Finds all YouTube iframes inside a rendered rich-text container,
 * replaces their src with a safe nocookie URL, wraps them in a
 * relative-positioned container, and places black overlays on top
 * of the YouTube title bar ("Copy link") and bottom-left corner
 * ("Watch on YouTube").
 *
 * Call this in a useEffect after the content_body HTML is mounted.
 */
export const fixRichTextVideos = (
  containerRef: React.RefObject<HTMLDivElement | null>
): void => {
  if (!containerRef.current) return;

  const iframes = containerRef.current.querySelectorAll<HTMLIFrameElement>('iframe');

  iframes.forEach(iframe => {
    const src = iframe.getAttribute('src') ?? '';
    if (!isYoutubeUrl(src)) return;

    const videoId = extractYoutubeId(src);
    if (!videoId) return;

    // Skip if already wrapped
    if (iframe.closest('.yt-protected')) return;

    // Replace src with safe nocookie URL
    iframe.setAttribute('src', buildSafeYoutubeUrl(videoId));
    iframe.removeAttribute('allowfullscreen');
    iframe.removeAttribute('allowFullScreen');

    // Make iframe fill the wrapper absolutely
    iframe.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:100%;border:none;';

    // Wrapper: 16:9 container
    const wrapper = document.createElement('div');
    wrapper.className = 'yt-protected';
    wrapper.style.cssText =
      'position:relative;aspect-ratio:16/9;background:#000;border-radius:12px;overflow:hidden;margin:8px 0;';

    // Black overlay — top bar (covers "Copy link" button, top title)
    const topOverlay = document.createElement('div');
    topOverlay.style.cssText =
      'position:absolute;top:0;left:0;right:0;height:50px;background:#000;z-index:20;pointer-events:none;';

    // Black overlay — bottom left (covers "Watch on YouTube")
    const botLeftOverlay = document.createElement('div');
    botLeftOverlay.style.cssText =
      'position:absolute;bottom:0;left:0;width:220px;height:45px;background:#000;z-index:20;pointer-events:none;';

    // Black overlay — bottom right (covers YouTube logo in controls)
    const botRightOverlay = document.createElement('div');
    botRightOverlay.style.cssText =
      'position:absolute;bottom:0;right:0;width:80px;height:45px;background:#000;z-index:20;pointer-events:none;';

    iframe.parentNode?.insertBefore(wrapper, iframe);
    wrapper.appendChild(iframe);
    wrapper.appendChild(topOverlay);
    wrapper.appendChild(botLeftOverlay);
    wrapper.appendChild(botRightOverlay);
  });

  // Disable YouTube anchor links in the rich text body
  containerRef.current
    .querySelectorAll<HTMLAnchorElement>('a')
    .forEach(a => {
      if (/youtube\.com|youtu\.be/.test(a.getAttribute('href') ?? '')) {
        a.removeAttribute('href');
        a.style.cssText = 'cursor:default;color:inherit;text-decoration:none;pointer-events:none;';
      }
    });
};
