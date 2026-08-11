import { EzSaveError } from '../shared/errors';
import { detectedMime, mimeForFormat, normalizeMime } from '../shared/mime';
import type { OutputFormat, PreparedMedia, SourceInput } from '../shared/types';
import { isBlobUrl, toAbsoluteUrl } from '../shared/url';

const MAX_CONVERTIBLE_BYTES = 120 * 1024 * 1024;
const OBJECT_URL_TTL_MS = 15 * 60 * 1000;

interface DecodedImage {
  image: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}

function assertSourceInput(source: SourceInput): string {
  const rawValue = source.kind === 'url' ? source.url : source.dataUrl;
  const value = toAbsoluteUrl(rawValue, location.href);
  if (!value || isBlobUrl(value)) {
    throw new EzSaveError('Unsupported source URL.', "EZSave couldn't access this image.");
  }
  if (source.kind === 'data-url' && value.length > MAX_CONVERTIBLE_BYTES * 1.4) {
    throw new EzSaveError('Page-provided payload is too large.', "EZSave couldn't access this image.");
  }
  return value;
}

async function readMediaBlob(source: SourceInput): Promise<Blob> {
  const url = assertSourceInput(source);
  let response: Response;
  try {
    response = await fetch(url, {
      cache: 'no-store',
      credentials: 'include',
      redirect: 'follow'
    });
  } catch (error) {
    console.warn('[EZSave] Media fetch failed.', error);
    throw new EzSaveError('Media fetch failed.', "EZSave couldn't access this image.");
  }

  if (!response.ok) {
    throw new EzSaveError(`Media fetch returned HTTP ${response.status}.`, 'The media URL is no longer available.');
  }

  const advertisedSize = Number(response.headers.get('content-length') ?? 0);
  if (advertisedSize > MAX_CONVERTIBLE_BYTES) {
    throw new EzSaveError('Media exceeds the conversion byte limit.', 'This media file is too large for EZSave to convert.');
  }

  const blob = await response.blob();
  if (!blob.size) {
    throw new EzSaveError('Media response was empty.', 'The media URL is no longer available.');
  }
  if (blob.size > MAX_CONVERTIBLE_BYTES) {
    throw new EzSaveError('Media exceeds the conversion byte limit.', 'This media file is too large for EZSave to convert.');
  }
  return blob;
}

async function decodeWithImageElement(blob: Blob): Promise<DecodedImage> {
  const objectUrl = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = 'async';

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Image element failed to decode the media.'));
      image.src = objectUrl;
    });
    await image.decode?.();
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }

  if (!image.naturalWidth || !image.naturalHeight) {
    URL.revokeObjectURL(objectUrl);
    throw new Error('Decoded image did not contain dimensions.');
  }

  return {
    image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    close: () => URL.revokeObjectURL(objectUrl)
  };
}

async function decodeImage(blob: Blob): Promise<DecodedImage> {
  try {
    const bitmap = await createImageBitmap(blob);
    if (!bitmap.width || !bitmap.height) {
      bitmap.close();
      throw new Error('Image bitmap did not contain dimensions.');
    }
    return {
      image: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close()
    };
  } catch (bitmapError) {
    try {
      return await decodeWithImageElement(blob);
    } catch (imageError) {
      console.warn('[EZSave] Image decoding failed.', { bitmapError, imageError });
      throw new EzSaveError('Unable to decode the media as an image.', 'The image format could not be decoded.');
    }
  }
}

async function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new EzSaveError('Canvas encoder returned no data.', 'EZSave could not convert this file.'));
        return;
      }
      resolve(blob);
    }, mime, quality);
  });
}

function preparedMedia(blob: Blob, mime: string): PreparedMedia {
  const objectUrl = URL.createObjectURL(blob);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), OBJECT_URL_TTL_MS);
  return {
    objectUrl,
    mime,
    bytes: blob.size
  };
}

export async function prepareOriginal(source: SourceInput): Promise<PreparedMedia> {
  const blob = await readMediaBlob(source);
  const mime = (await detectedMime(blob)) ?? normalizeMime(blob.type) ?? 'application/octet-stream';
  return preparedMedia(blob, mime);
}

export async function convertImage(source: SourceInput, format: OutputFormat): Promise<PreparedMedia> {
  const input = await readMediaBlob(source);
  const actualMime = await detectedMime(input);
  if (actualMime && !actualMime.startsWith('image/')) {
    throw new EzSaveError(`The source is ${actualMime}, not an image.`, 'The selected media is not a decodable image.');
  }

  const decoded = await decodeImage(input);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = decoded.width;
    canvas.height = decoded.height;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new EzSaveError('Canvas context was unavailable.', 'EZSave could not convert this file.');
    }

    if (format === 'jpeg') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(decoded.image, 0, 0, canvas.width, canvas.height);

    const expectedMime = mimeForFormat(format);
    const output = await canvasToBlob(canvas, expectedMime, format === 'png' ? 1 : 0.95);
    const encodedMime = normalizeMime(output.type);
    if (encodedMime !== expectedMime) {
      throw new EzSaveError(`Canvas encoded ${encodedMime ?? 'an unknown type'} instead of ${expectedMime}.`, 'EZSave could not convert this file.');
    }

    return preparedMedia(output, encodedMime);
  } finally {
    decoded.close();
  }
}

export function revokePreparedMedia(objectUrl: string): void {
  if (objectUrl.startsWith(`blob:${location.origin}/`)) {
    URL.revokeObjectURL(objectUrl);
  }
}
