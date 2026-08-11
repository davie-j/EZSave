import type { PagePayload, VideoFramePayload } from '../shared/types';
import { isBlobUrl } from '../shared/url';
import type { LocalContextTarget } from './media-detector';

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The browser could not read the media data.'));
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('The browser returned an invalid media payload.'));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(blob);
  });
}

export async function fetchPageBlob(url: string, maxBytes: number): Promise<PagePayload> {
  if (!isBlobUrl(url)) {
    throw new Error('EZSave can only request page-side blobs for blob URLs.');
  }

  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) {
    throw new Error(`The page returned HTTP ${response.status}.`);
  }

  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > maxBytes) {
    throw new Error('The page-backed media is too large to transfer safely.');
  }

  const blob = await response.blob();
  if (!blob.size) {
    throw new Error('The page returned an empty media file.');
  }
  if (blob.size > maxBytes) {
    throw new Error('The page-backed media is too large to transfer safely.');
  }

  return {
    dataUrl: await blobToDataUrl(blob),
    mime: blob.type || undefined,
    bytes: blob.size
  };
}

export async function captureVideoFrame(target: LocalContextTarget | null): Promise<VideoFramePayload> {
  if (!(target?.element instanceof HTMLVideoElement)) {
    throw new Error('The selected video is no longer available.');
  }

  const video = target.element;
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
    throw new Error('The selected video frame is not ready yet.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) {
    throw new Error('The browser could not create a video frame canvas.');
  }

  try {
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) {
          resolve(result);
        } else {
          reject(new Error('The browser could not encode the video frame.'));
        }
      }, 'image/png');
    });

    return {
      dataUrl: await blobToDataUrl(blob),
      mime: blob.type,
      bytes: blob.size,
      width: video.videoWidth,
      height: video.videoHeight,
      currentTime: video.currentTime
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'SecurityError') {
      throw new Error('This video frame is protected from canvas capture by the site.');
    }
    throw error;
  }
}
