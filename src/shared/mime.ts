import type { OutputFormat } from './types';

const MIME_EXTENSIONS: Record<string, string> = {
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm'
};

const EXTENSION_MIMES: Record<string, string> = Object.fromEntries(
  Object.entries(MIME_EXTENSIONS).map(([mime, extension]) => [extension, mime])
);

EXTENSION_MIMES.jpeg = 'image/jpeg';
EXTENSION_MIMES.jfif = 'image/jpeg';

export function normalizeMime(mime?: string | null): string | undefined {
  if (!mime) {
    return undefined;
  }

  const normalized = mime.split(';', 1)[0].trim().toLowerCase();
  return normalized || undefined;
}

export function extensionForMime(mime?: string): string | undefined {
  return mime ? MIME_EXTENSIONS[normalizeMime(mime) ?? ''] : undefined;
}

export function mimeForExtension(extension?: string): string | undefined {
  return extension ? EXTENSION_MIMES[extension.toLowerCase().replace(/^\./, '')] : undefined;
}

export function mimeForFormat(format: OutputFormat): string {
  switch (format) {
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
  }
}

export function extensionForFormat(format: OutputFormat): string {
  return format === 'jpeg' ? 'jpg' : format;
}

export function inferMimeFromUrl(value: string): string | undefined {
  if (value.startsWith('data:')) {
    const match = /^data:([^;,]+)/i.exec(value);
    return normalizeMime(match?.[1]);
  }

  try {
    const pathname = new URL(value).pathname;
    const extension = /\.([A-Za-z0-9]+)$/.exec(pathname)?.[1];
    return mimeForExtension(extension);
  } catch {
    return undefined;
  }
}

export function sniffMime(bytes: Uint8Array): string | undefined {
  if (bytes.length >= 8) {
    const signature = String.fromCharCode(...bytes.slice(0, 8));
    if (signature === '\u0089PNG\r\n\u001a\n') {
      return 'image/png';
    }
    if (signature.startsWith('GIF87a') || signature.startsWith('GIF89a')) {
      return 'image/gif';
    }
    if (
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    ) {
      return 'image/jpeg';
    }
    if (
      signature.slice(0, 4) === 'RIFF' &&
      String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
    ) {
      return 'image/webp';
    }
    if (
      bytes[0] === 0x1a &&
      bytes[1] === 0x45 &&
      bytes[2] === 0xdf &&
      bytes[3] === 0xa3
    ) {
      return 'video/webm';
    }
  }

  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp') {
    const brand = String.fromCharCode(...bytes.slice(8, 12)).toLowerCase();
    if (brand.startsWith('avi')) {
      return 'image/avif';
    }
    return 'video/mp4';
  }

  return undefined;
}

export async function detectedMime(blob: Blob): Promise<string | undefined> {
  const declared = normalizeMime(blob.type);
  const signature = sniffMime(new Uint8Array(await blob.slice(0, 32).arrayBuffer()));
  return signature ?? declared;
}

export function isGifMime(mime?: string): boolean {
  return normalizeMime(mime) === 'image/gif';
}
