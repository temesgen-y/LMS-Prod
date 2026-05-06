'use client';

import { useEffect, useState } from 'react';
import { extractYoutubeId, buildSafeYoutubeUrl, isYoutubeUrl } from '@/utils/videoUtils';

interface Props {
  url: string;
  title: string;
  onEnded?: () => void;
}

export default function ProtectedVideoPlayer({ url, title, onEnded }: Props) {
  const [embedUrl, setEmbedUrl] = useState('');
  const [isYT, setIsYT] = useState(false);

  useEffect(() => {
    if (!url) return;
    if (isYoutubeUrl(url)) {
      const id = extractYoutubeId(url);
      if (id) {
        setEmbedUrl(buildSafeYoutubeUrl(id));
        setIsYT(true);
      }
    } else {
      setEmbedUrl(url);
      setIsYT(false);
    }
  }, [url]);

  if (!embedUrl) return null;

  if (!isYT) {
    return (
      <video
        controls
        controlsList="nodownload noremoteplayback"
        disablePictureInPicture
        className="w-full rounded-xl bg-black"
        style={{ maxHeight: '480px' }}
        src={embedUrl}
        onEnded={onEnded}
      />
    );
  }

  return (
    <div
      className="relative rounded-xl overflow-hidden bg-black select-none"
      style={{ aspectRatio: '16/9' }}
    >
      <iframe
        src={embedUrl}
        title={title}
        className="absolute inset-0 w-full h-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        style={{ border: 'none' }}
      />

      {/*
        TOP overlay — 80px tall.
        Covers the full YouTube title bar including the "Copy link" button
        (which YouTube renders at the top-right when hovered).
        pointer-events: auto means this div intercepts ALL mouse events —
        clicks and right-clicks land here (parent page) not inside the iframe.
        Right-clicking here shows the browser's plain context menu, not
        YouTube's player menu.
      */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '80px',
          background: '#000',
          zIndex: 20,
          cursor: 'default',
        }}
      />

      {/*
        BOTTOM-LEFT overlay — hides "Watch on YouTube" button.
        pointer-events: auto blocks clicks/right-clicks in this corner.
        Video seek bar and volume are in the centre, not this corner.
      */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: '240px',
          height: '48px',
          background: '#000',
          zIndex: 20,
          cursor: 'default',
        }}
      />

      {/*
        BOTTOM-RIGHT overlay — hides YouTube logo button (the red icon that
        opens YouTube, sitting to the left of the settings gear in the controls bar).
        Controls bar layout from right: [Fullscreen ~36px][Settings ~36px][YT-logo ~36px]
        200px covers all three and prevents clicking the YouTube logo.
      */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          right: 0,
          width: '200px',
          height: '56px',
          background: '#000',
          zIndex: 20,
          cursor: 'default',
        }}
      />
    </div>
  );
}
