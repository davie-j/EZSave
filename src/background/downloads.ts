import { sanitizeFilename } from '../shared/filename';
import type { PreparedMedia } from '../shared/types';

const objectUrlDownloads = new Map<number, string>();

export function setupDownloadCleanup(revoke: (objectUrl: string) => Promise<void>): void {
  chrome.downloads.onChanged.addListener((delta) => {
    if (delta.state?.current !== 'complete' && delta.state?.current !== 'interrupted') {
      return;
    }

    const objectUrl = objectUrlDownloads.get(delta.id);
    if (!objectUrl) {
      return;
    }

    objectUrlDownloads.delete(delta.id);
    void revoke(objectUrl);
  });
}

export async function downloadDirect(url: string, filename: string): Promise<number> {
  return chrome.downloads.download({
    url,
    filename: sanitizeFilename(filename),
    saveAs: true,
    conflictAction: 'uniquify'
  });
}

export async function downloadPrepared(prepared: PreparedMedia, filename: string): Promise<number> {
  const downloadId = await chrome.downloads.download({
    url: prepared.objectUrl,
    filename: sanitizeFilename(filename),
    saveAs: true,
    conflictAction: 'uniquify'
  });
  objectUrlDownloads.set(downloadId, prepared.objectUrl);
  return downloadId;
}
