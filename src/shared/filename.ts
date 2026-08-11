import { extensionForMime, inferMimeFromUrl } from './mime';
import type { OutputFormat } from './types';

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;
const RESERVED_WINDOWS_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const MAX_FILENAME_LENGTH = 180;

function decodeFilename(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function filenameFromUrl(sourceUrl: string, fallback = 'ezsave-media'): string {
  if (sourceUrl.startsWith('data:') || sourceUrl.startsWith('blob:')) {
    return fallback;
  }

  try {
    const pathname = new URL(sourceUrl).pathname;
    const segment = pathname.split('/').filter(Boolean).at(-1);
    return segment ? decodeFilename(segment) : fallback;
  } catch {
    return fallback;
  }
}

export function sanitizeFilename(value: string, fallback = 'ezsave-media'): string {
  const pathParts = value.split(/[/\\]+/).filter((part) => part && part !== '.' && part !== '..');
  const leaf = (pathParts.at(-1) ?? value).replace(INVALID_FILENAME_CHARS, ' ');
  const compact = leaf.replace(/\s+/g, ' ').trim().replace(/^\.+|\.+$/g, '');
  const safe = compact && !RESERVED_WINDOWS_NAME.test(compact) ? compact : fallback;
  return safe.slice(0, MAX_FILENAME_LENGTH).replace(/[. ]+$/g, '') || fallback;
}

export function replaceExtension(filename: string, extension: string): string {
  const safe = sanitizeFilename(filename);
  const normalizedExtension = extension.replace(/^\.+/, '').toLowerCase();
  const lastDot = safe.lastIndexOf('.');
  const stem = lastDot > 0 ? safe.slice(0, lastDot) : safe;
  return `${stem || 'ezsave-media'}.${normalizedExtension}`;
}

export function originalFilename(
  filenameHint: string,
  sourceUrl: string,
  actualMime?: string
): string {
  const safeHint = sanitizeFilename(filenameHint || filenameFromUrl(sourceUrl));
  if (/\.[A-Za-z0-9]{1,12}$/.test(safeHint)) {
    return safeHint;
  }

  const extension = extensionForMime(actualMime) ?? extensionForMime(inferMimeFromUrl(sourceUrl));
  return extension ? replaceExtension(safeHint, extension) : safeHint;
}

export function convertedFilename(filenameHint: string, format: OutputFormat): string {
  return replaceExtension(filenameHint, format === 'jpeg' ? 'jpg' : format);
}
