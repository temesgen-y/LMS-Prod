'use client';

export interface FaceDetectionResult {
  faceDetected: boolean;
  faceCount: number;
  confidence: number | null;
}

declare global {
  interface Window {
    FaceDetector?: new (options?: { maxDetectedFaces?: number; fastMode?: boolean }) => {
      detect(image: ImageBitmapSource): Promise<Array<{ boundingBox: DOMRectReadOnly; landmarks?: unknown[] }>>;
    };
  }
}

export async function detectFaces(videoEl: HTMLVideoElement): Promise<FaceDetectionResult> {
  // Use the FaceDetector API if available (Chrome on supported hardware)
  if (typeof window !== 'undefined' && window.FaceDetector) {
    try {
      const detector = new window.FaceDetector({ maxDetectedFaces: 5, fastMode: true });
      const faces = await detector.detect(videoEl);
      return {
        faceDetected: faces.length > 0,
        faceCount:    faces.length,
        confidence:   null,
      };
    } catch {
      // Fall through to canvas heuristic
    }
  }

  // Fallback: brightness/variance heuristic on canvas frame
  return detectFaceByHeuristic(videoEl);
}

function detectFaceByHeuristic(videoEl: HTMLVideoElement): FaceDetectionResult {
  try {
    const canvas = document.createElement('canvas');
    canvas.width  = 160;
    canvas.height = 120;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { faceDetected: false, faceCount: 0, confidence: null };

    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

    let sum = 0;
    let sumSq = 0;
    const pixels = canvas.width * canvas.height;
    for (let i = 0; i < data.length; i += 4) {
      const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      sum   += luma;
      sumSq += luma * luma;
    }
    const mean = sum / pixels;
    const variance = sumSq / pixels - mean * mean;

    // A blank/dark frame has low variance; reasonable chance of a face if variance > 300
    const faceDetected = variance > 300 && mean > 30;
    return { faceDetected, faceCount: faceDetected ? 1 : 0, confidence: Math.min(100, variance / 10) };
  } catch {
    return { faceDetected: false, faceCount: 0, confidence: null };
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
