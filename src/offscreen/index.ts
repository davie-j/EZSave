import type { OffscreenMessage, OffscreenResult } from '../shared/messages';
import { EzSaveError } from '../shared/errors';
import { convertImage, prepareOriginal, revokePreparedMedia } from './converter';

function isOffscreenMessage(value: unknown): value is OffscreenMessage {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as { target?: unknown }).target === 'offscreen' &&
      typeof (value as { type?: unknown }).type === 'string'
  );
}

function errorText(error: unknown): string {
  if (error instanceof EzSaveError) {
    return error.userMessage;
  }
  return error instanceof Error ? error.message : 'EZSave could not convert this file.';
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!isOffscreenMessage(message) || sender.id !== chrome.runtime.id) {
    return;
  }

  if (message.type === 'EZ_SAVE_OFFSCREEN_REVOKE') {
    revokePreparedMedia(message.objectUrl);
    sendResponse({ ok: true, value: undefined });
    return;
  }

  const operation = message.type === 'EZ_SAVE_OFFSCREEN_CONVERT'
    ? convertImage(message.source, message.format)
    : prepareOriginal(message.source);

  void operation
    .then((value) => sendResponse({ ok: true, value } satisfies OffscreenResult))
    .catch((error: unknown) => {
      console.error('[EZSave] Offscreen media processing failed.', error);
      sendResponse({ ok: false, error: errorText(error) } satisfies OffscreenResult);
    });
  return true;
});
