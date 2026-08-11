import type {
  OffscreenConvertMessage,
  OffscreenMessage,
  OffscreenPrepareOriginalMessage,
  OffscreenResult
} from '../shared/messages';
import { EzSaveError } from '../shared/errors';
import type { PreparedMedia } from '../shared/types';

const OFFSCREEN_DOCUMENT_PATH = 'offscreen/offscreen.html';

let creatingDocument: Promise<void> | null = null;

async function hasOffscreenDocument(): Promise<boolean> {
  const url = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [url]
  });
  return contexts.length > 0;
}

export async function ensureOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) {
    return;
  }

  if (!creatingDocument) {
    creatingDocument = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: ['BLOBS'],
        justification: 'EZSave decodes media and creates downloadable image conversion blobs.'
      })
      .finally(() => {
        creatingDocument = null;
      });
  }

  await creatingDocument;
}

async function sendOffscreenMessage<T>(message: OffscreenMessage): Promise<T> {
  await ensureOffscreenDocument();
  const response = (await chrome.runtime.sendMessage(message)) as OffscreenResult | undefined;
  if (!response) {
    throw new EzSaveError('The offscreen document did not respond.', "EZSave couldn't prepare this media.");
  }
  if (!response.ok) {
    throw new EzSaveError(response.error, "EZSave couldn't prepare this media.");
  }
  return response.value as T;
}

export function convertInOffscreen(message: OffscreenConvertMessage): Promise<PreparedMedia> {
  return sendOffscreenMessage<PreparedMedia>(message);
}

export function prepareOriginalInOffscreen(message: OffscreenPrepareOriginalMessage): Promise<PreparedMedia> {
  return sendOffscreenMessage<PreparedMedia>(message);
}

export async function revokeOffscreenObjectUrl(objectUrl: string): Promise<void> {
  try {
    await ensureOffscreenDocument();
    await chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'EZ_SAVE_OFFSCREEN_REVOKE',
      objectUrl
    });
  } catch (error) {
    console.warn('[EZSave] Failed to revoke a temporary object URL.', error);
  }
}
