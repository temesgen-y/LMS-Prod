'use client';

export interface FaceDetectionResult {
  faceDetected: boolean;
  faceCount: number;
  confidence: number | null;
  lookingAway: boolean;
  phoneDetected: boolean;
}

declare global {
  interface Window {
    FaceDetector?: new (options?: { maxDetectedFaces?: number; fastMode?: boolean }) => {
      detect(image: ImageBitmapSource): Promise<Array<{ boundingBox: DOMRectReadOnly; landmarks?: unknown[] }>>;
    };
  }
}

export async function detectFaces(videoEl: HTMLVideoElement): Promise<FaceDetectionResult> {
  if (typeof window !== 'undefined' && window.FaceDetector) {
    try {
      const detector = new window.FaceDetector({ maxDetectedFaces: 5, fastMode: true });
      const faces = await detector.detect(videoEl);
      const faceDetected = faces.length > 0;

      let lookingAway = false;
      if (faceDetected && faces.length === 1) {
        lookingAway = isLookingAway(faces[0].boundingBox, videoEl.videoWidth || 320, videoEl.videoHeight || 240);
      } else if (!faceDetected) {
        lookingAway = true;
      }

      const phoneDetected = detectPhoneInFrame(videoEl);

      return { faceDetected, faceCount: faces.length, confidence: null, lookingAway, phoneDetected };
    } catch {
      // Fall through to canvas heuristic
    }
  }

  return detectFaceByHeuristic(videoEl);
}

// Uses face bounding box position within frame to infer if person is looking away.
// Without eye/landmark data this is a head-pose proxy: if the face is heavily off-center
// horizontally, positioned at the very bottom, unusually small, or has an extreme aspect
// ratio (head turned sideways), we consider them "looking away".
function isLookingAway(bb: DOMRectReadOnly, videoWidth: number, videoHeight: number): boolean {
  const faceCenterX = bb.x + bb.width / 2;
  const faceCenterY = bb.y + bb.height / 2;

  const horizontalOffset = Math.abs(faceCenterX / videoWidth - 0.5);
  const verticalPosition = faceCenterY / videoHeight;
  const faceAreaRatio = (bb.width * bb.height) / (videoWidth * videoHeight);
  const aspectRatio = bb.height > 0 ? bb.width / bb.height : 1;

  // Face too far to either side
  if (horizontalOffset > 0.38) return true;
  // Face in bottom 20% of frame (looking down)
  if (verticalPosition > 0.80) return true;
  // Face occupies < 1.5% of frame (too far or turned away)
  if (faceAreaRatio < 0.015) return true;
  // Very wide face box = head rotated far left/right; very narrow = head tilted sharply
  if (aspectRatio > 1.8 || aspectRatio < 0.35) return true;

  return false;
}

// Canvas heuristic: scan the video frame for a bright portrait-orientation rectangle
// that might be a phone screen being held in the camera's view.
// Returns true if a high-confidence screen-like region is found.
function detectPhoneInFrame(videoEl: HTMLVideoElement): boolean {
  try {
    const W = 120, H = 90;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.drawImage(videoEl, 0, 0, W, H);
    const { data } = ctx.getImageData(0, 0, W, H);

    // Build brightness map
    const bright: number[] = new Array(W * H);
    let totalBright = 0;
    for (let i = 0; i < data.length; i += 4) {
      const b = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      bright[i / 4] = b;
      totalBright += b;
    }
    const avgBright = totalBright / (W * H);

    // A phone screen will be significantly brighter than the scene average (> 1.8x)
    const threshold = Math.min(220, avgBright * 1.8 + 30);

    // Count bright pixels per column and per row
    const colBright: number[] = new Array(W).fill(0);
    const rowBright: number[] = new Array(H).fill(0);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (bright[y * W + x] >= threshold) {
          colBright[x]++;
          rowBright[y]++;
        }
      }
    }

    // Find contiguous bright columns and rows
    const brightColRun = maxContiguousRun(colBright, H * 0.35);
    const brightRowRun = maxContiguousRun(rowBright, W * 0.25);

    // A phone in portrait would appear as a taller-than-wide bright rectangle.
    // Require at least 5 cols wide, 15 rows tall, and portrait orientation.
    if (brightColRun.length >= 5 && brightRowRun.length >= 15 && brightRowRun.length > brightColRun.length * 1.3) {
      // Confirm the region is actually very bright (average > threshold)
      const regionBrightness = computeRegionBrightness(
        bright, W,
        brightColRun.start, brightRowRun.start,
        brightColRun.length, brightRowRun.length
      );
      return regionBrightness > threshold * 0.9;
    }
    return false;
  } catch {
    return false;
  }
}

function maxContiguousRun(arr: number[], minVal: number): { start: number; length: number } {
  let best = { start: 0, length: 0 };
  let cur = { start: 0, length: 0 };
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] >= minVal) {
      if (cur.length === 0) cur.start = i;
      cur.length++;
      if (cur.length > best.length) best = { ...cur };
    } else {
      cur = { start: 0, length: 0 };
    }
  }
  return best;
}

function computeRegionBrightness(
  bright: number[], W: number,
  x: number, y: number, w: number, h: number
): number {
  let sum = 0, count = 0;
  for (let row = y; row < y + h; row++) {
    for (let col = x; col < x + w; col++) {
      sum += bright[row * W + col];
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

function detectFaceByHeuristic(videoEl: HTMLVideoElement): FaceDetectionResult {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 160; canvas.height = 120;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { faceDetected: false, faceCount: 0, confidence: null, lookingAway: true, phoneDetected: false };

    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

    let sum = 0, sumSq = 0;
    const pixels = canvas.width * canvas.height;
    for (let i = 0; i < data.length; i += 4) {
      const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      sum += luma; sumSq += luma * luma;
    }
    const mean = sum / pixels;
    const variance = sumSq / pixels - mean * mean;

    const faceDetected = variance > 300 && mean > 30;
    const phoneDetected = detectPhoneInFrame(videoEl);
    return {
      faceDetected,
      faceCount: faceDetected ? 1 : 0,
      confidence: Math.min(100, variance / 10),
      lookingAway: !faceDetected,
      phoneDetected,
    };
  } catch {
    return { faceDetected: false, faceCount: 0, confidence: null, lookingAway: true, phoneDetected: false };
  }
}

export function captureFrame(videoEl: HTMLVideoElement, quality = 0.7): string | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width  = videoEl.videoWidth  || 320;
    canvas.height = videoEl.videoHeight || 240;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(videoEl, 0, 0);
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return null;
  }
}
