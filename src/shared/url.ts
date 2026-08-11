const SUPPORTED_PROTOCOLS = new Set(['http:', 'https:', 'data:', 'blob:']);

export function toAbsoluteUrl(value: string, baseUrl: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed, baseUrl);
    return SUPPORTED_PROTOCOLS.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function isSupportedMediaUrl(value: string): boolean {
  return toAbsoluteUrl(value, location.href) !== null;
}

export function isRemoteUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

export function isBlobUrl(value: string): boolean {
  return value.startsWith('blob:');
}

export function isDataUrl(value: string): boolean {
  return value.startsWith('data:');
}

export function isLikelyStreamingUrl(value: string): boolean {
  try {
    const pathname = new URL(value).pathname.toLowerCase();
    return pathname.endsWith('.m3u8') || pathname.endsWith('.mpd');
  } catch {
    return false;
  }
}
