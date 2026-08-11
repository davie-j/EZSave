import { downloadDirect, downloadPrepared, setupDownloadCleanup } from './downloads';
import { actionForMenuId, setupContextMenus, showMenuFor } from './menu';
import { convertInOffscreen, prepareOriginalInOffscreen, revokeOffscreenObjectUrl } from './offscreen';
import { EzSaveError, userMessageForError } from '../shared/errors';
import { convertedFilename, filenameFromUrl, originalFilename } from '../shared/filename';
import { inferMimeFromUrl, isGifMime } from '../shared/mime';
import type {
  ContentMessage,
  ContextTargetMessage,
  PayloadResult
} from '../shared/messages';
import type {
  ContextTarget,
  MediaDescriptor,
  MenuAction,
  PagePayload,
  SourceInput,
  ToastLevel,
  VideoFramePayload
} from '../shared/types';
import { isBlobUrl, isLikelyStreamingUrl, isRemoteUrl, toAbsoluteUrl } from '../shared/url';

const CONTEXT_TARGET_MAX_AGE_MS = 120_000;
const PAGE_BLOB_TRANSFER_LIMIT = 24 * 1024 * 1024;

type ContextMenuInfo = {
  frameId?: number;
  mediaType?: string;
  pageUrl?: string;
  srcUrl?: string;
};

const contextTargets = new Map<string, ContextTarget>();

function targetKey(tabId: number, frameId: number): string {
  return `${tabId}:${frameId}`;
}

function frameIdFor(info: ContextMenuInfo): number {
  return Number.isInteger(info.frameId) ? Number(info.frameId) : 0;
}

function isFresh(target: ContextTarget): boolean {
  return Date.now() - target.capturedAt < CONTEXT_TARGET_MAX_AGE_MS;
}

function storedTarget(tabId: number, frameId: number): ContextTarget | null {
  const key = targetKey(tabId, frameId);
  const target = contextTargets.get(key);
  if (!target) {
    return null;
  }
  if (!isFresh(target)) {
    contextTargets.delete(key);
    return null;
  }
  return target;
}

function normalizeDescriptor(value: unknown): MediaDescriptor | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Partial<MediaDescriptor>;
  if (raw.kind !== 'image' && raw.kind !== 'gif' && raw.kind !== 'video') {
    return null;
  }
  if (typeof raw.sourceUrl !== 'string') {
    return null;
  }

  const baseUrl = typeof raw.pageUrl === 'string' && raw.pageUrl ? raw.pageUrl : 'https://invalid.ezsave/';
  const sourceUrl = toAbsoluteUrl(raw.sourceUrl, baseUrl);
  if (!sourceUrl) {
    return null;
  }

  const filenameHint = typeof raw.filenameHint === 'string' && raw.filenameHint
    ? raw.filenameHint
    : 'ezsave-media';
  const capturedAt = typeof raw.capturedAt === 'number' ? raw.capturedAt : Date.now();
  return {
    kind: raw.kind,
    sourceUrl,
    candidates: [{ url: sourceUrl, score: 0, source: 'src' }],
    filenameHint,
    mimeHint: typeof raw.mimeHint === 'string' ? raw.mimeHint : inferMimeFromUrl(sourceUrl),
    pageUrl: typeof raw.pageUrl === 'string' ? raw.pageUrl : '',
    elementTag: typeof raw.elementTag === 'string' ? raw.elementTag : 'unknown',
    isBackground: raw.isBackground === true,
    width: typeof raw.width === 'number' ? raw.width : undefined,
    height: typeof raw.height === 'number' ? raw.height : undefined,
    capturedAt
  };
}

function normalizeContextTarget(value: unknown): ContextTarget | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Partial<ContextTarget>;
  const descriptor = normalizeDescriptor(raw.descriptor);
  if (!descriptor) {
    return null;
  }

  return {
    descriptor,
    capturedAt: typeof raw.capturedAt === 'number' ? raw.capturedAt : Date.now()
  };
}

function fallbackDescriptor(info: ContextMenuInfo): MediaDescriptor | null {
  if (!info.srcUrl || (info.mediaType !== 'image' && info.mediaType !== 'video')) {
    return null;
  }

  const sourceUrl = toAbsoluteUrl(info.srcUrl, info.pageUrl || 'https://invalid.ezsave/');
  if (!sourceUrl) {
    return null;
  }

  const mimeHint = inferMimeFromUrl(sourceUrl);
  const kind = info.mediaType === 'video' ? 'video' : isGifMime(mimeHint) || /\.gif(?:$|[?#])/i.test(sourceUrl) ? 'gif' : 'image';
  return {
    kind,
    sourceUrl,
    candidates: [{ url: sourceUrl, score: 0, source: 'src' }],
    filenameHint: filenameFromUrl(sourceUrl),
    mimeHint,
    pageUrl: info.pageUrl || '',
    elementTag: info.mediaType,
    capturedAt: Date.now()
  };
}

function isContextTargetMessage(message: unknown): message is ContextTargetMessage {
  return Boolean(
    message &&
      typeof message === 'object' &&
      (message as { type?: unknown }).type === 'EZ_SAVE_CONTEXT_TARGET'
  );
}

async function requestFromContent<T>(
  tabId: number,
  frameId: number,
  message: ContentMessage
): Promise<PayloadResult<T>> {
  try {
    const response = (await chrome.tabs.sendMessage(tabId, message, { frameId })) as PayloadResult<T> | undefined;
    if (!response) {
      return { ok: false, error: 'The page did not respond.' };
    }
    return response;
  } catch (error) {
    console.warn('[EZSave] Content-script message failed.', error);
    return { ok: false, error: 'The page did not respond.' };
  }
}

async function descriptorFromContent(tabId: number, frameId: number): Promise<MediaDescriptor | null> {
  const response = await requestFromContent<ContextTarget | null>(tabId, frameId, {
    type: 'EZ_SAVE_GET_CONTEXT_TARGET'
  });
  if (!response.ok || !response.value) {
    return null;
  }

  const target = normalizeContextTarget(response.value);
  if (!target || !isFresh(target)) {
    return null;
  }
  contextTargets.set(targetKey(tabId, frameId), target);
  return target.descriptor;
}

async function resolveDescriptor(
  info: ContextMenuInfo,
  tab: chrome.tabs.Tab | undefined
): Promise<MediaDescriptor | null> {
  if (typeof tab?.id !== 'number') {
    return null;
  }

  const frameId = frameIdFor(info);
  const target = storedTarget(tab.id, frameId);
  if (target) {
    return target.descriptor;
  }

  const fromContent = await descriptorFromContent(tab.id, frameId);
  return fromContent ?? fallbackDescriptor(info);
}

async function showToast(
  tabId: number,
  frameId: number,
  message: string,
  level: ToastLevel
): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'EZ_SAVE_SHOW_TOAST',
      message,
      level
    }, { frameId });
  } catch {
    console.info('[EZSave]', message);
  }
}

async function sourceForDescriptor(
  descriptor: MediaDescriptor,
  tabId: number,
  frameId: number,
  unavailableMessage = "EZSave couldn't access this image."
): Promise<SourceInput> {
  if (!isBlobUrl(descriptor.sourceUrl)) {
    return { kind: 'url', url: descriptor.sourceUrl };
  }

  const response = await requestFromContent<PagePayload>(tabId, frameId, {
    type: 'EZ_SAVE_FETCH_PAGE_BLOB',
    url: descriptor.sourceUrl,
    maxBytes: PAGE_BLOB_TRANSFER_LIMIT
  });
  if (!response.ok || !response.value?.dataUrl.startsWith('data:')) {
    throw new EzSaveError(response.ok ? 'The blob payload was malformed.' : response.error, unavailableMessage);
  }

  return { kind: 'data-url', dataUrl: response.value.dataUrl };
}

function frameFilename(filenameHint: string, format: NonNullable<MenuAction['format']>): string {
  const lastDot = filenameHint.lastIndexOf('.');
  const stem = lastDot > 0 ? filenameHint.slice(0, lastDot) : filenameHint;
  return convertedFilename(`${stem || 'ezsave-video'}-frame`, format);
}

async function saveOriginal(
  descriptor: MediaDescriptor,
  tabId: number,
  frameId: number,
  isVideo: boolean
): Promise<string> {
  if (isVideo && isLikelyStreamingUrl(descriptor.sourceUrl)) {
    throw new EzSaveError('A streaming manifest was selected.', 'This video uses a protected or unsupported streaming format.');
  }

  if (isRemoteUrl(descriptor.sourceUrl)) {
    const filename = originalFilename(descriptor.filenameHint, descriptor.sourceUrl, descriptor.mimeHint);
    await downloadDirect(descriptor.sourceUrl, filename);
    return filename;
  }

  const source = await sourceForDescriptor(
    descriptor,
    tabId,
    frameId,
    isVideo ? 'This video uses a protected or unsupported streaming format.' : undefined
  );
  const prepared = await prepareOriginalInOffscreen({
    target: 'offscreen',
    type: 'EZ_SAVE_OFFSCREEN_PREPARE_ORIGINAL',
    source
  });
  const filename = originalFilename(descriptor.filenameHint, descriptor.sourceUrl, prepared.mime);
  await downloadPrepared(prepared, filename);
  return filename;
}

async function convertDescriptor(
  descriptor: MediaDescriptor,
  tabId: number,
  frameId: number,
  format: NonNullable<MenuAction['format']>
): Promise<string> {
  const source = await sourceForDescriptor(descriptor, tabId, frameId);
  const prepared = await convertInOffscreen({
    target: 'offscreen',
    type: 'EZ_SAVE_OFFSCREEN_CONVERT',
    source,
    format
  });
  const filename = convertedFilename(descriptor.filenameHint, format);
  await downloadPrepared(prepared, filename);
  return filename;
}

async function captureAndConvertVideoFrame(
  descriptor: MediaDescriptor,
  tabId: number,
  frameId: number,
  format: NonNullable<MenuAction['format']>
): Promise<string> {
  const response = await requestFromContent<VideoFramePayload>(tabId, frameId, {
    type: 'EZ_SAVE_CAPTURE_VIDEO_FRAME'
  });
  if (!response.ok || !response.value?.dataUrl.startsWith('data:')) {
    throw new EzSaveError(
      response.ok ? 'The video frame payload was malformed.' : response.error,
      'EZSave could not capture this video frame.'
    );
  }

  const prepared = await convertInOffscreen({
    target: 'offscreen',
    type: 'EZ_SAVE_OFFSCREEN_CONVERT',
    source: { kind: 'data-url', dataUrl: response.value.dataUrl },
    format
  });
  const filename = frameFilename(descriptor.filenameHint, format);
  await downloadPrepared(prepared, filename);
  return filename;
}

async function performAction(
  action: MenuAction,
  descriptor: MediaDescriptor,
  tabId: number,
  frameId: number
): Promise<string> {
  if (action.kind === 'image') {
    if (descriptor.kind !== 'image') {
      throw new EzSaveError('The selected target is not a normal image.', "EZSave couldn't access this image.");
    }
    return action.operation === 'original'
      ? saveOriginal(descriptor, tabId, frameId, false)
      : convertDescriptor(descriptor, tabId, frameId, action.format!);
  }

  if (action.kind === 'gif') {
    if (descriptor.kind !== 'gif') {
      throw new EzSaveError('The selected target is not a GIF.', "EZSave couldn't access this image.");
    }
    return action.operation === 'original'
      ? saveOriginal(descriptor, tabId, frameId, false)
      : convertDescriptor(descriptor, tabId, frameId, action.format!);
  }

  if (descriptor.kind !== 'video') {
    throw new EzSaveError('The selected target is not a video.', 'This video is no longer available.');
  }
  return action.operation === 'original'
    ? saveOriginal(descriptor, tabId, frameId, true)
    : captureAndConvertVideoFrame(descriptor, tabId, frameId, action.format!);
}

async function handleMenuClick(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab): Promise<void> {
  const action = actionForMenuId(info.menuItemId);
  if (!action || typeof tab?.id !== 'number') {
    return;
  }

  const frameId = frameIdFor(info);
  try {
    const descriptor = await resolveDescriptor(info, tab);
    if (!descriptor) {
      throw new EzSaveError('No media descriptor was available.', "EZSave couldn't access this image.");
    }

    const filename = await performAction(action, descriptor, tab.id, frameId);
    await showToast(tab.id, frameId, `EZSave opened Save As for ${filename}.`, 'success');
  } catch (error) {
    console.error('[EZSave] Menu action failed.', error);
    await showToast(tab.id, frameId, userMessageForError(error), 'error');
  }
}

setupDownloadCleanup(revokeOffscreenObjectUrl);
void setupContextMenus().catch((error) => console.error('[EZSave] Context menu setup failed.', error));

chrome.runtime.onInstalled.addListener(() => {
  void setupContextMenus().catch((error) => console.error('[EZSave] Context menu installation failed.', error));
});

chrome.runtime.onStartup.addListener(() => {
  void setupContextMenus().catch((error) => console.error('[EZSave] Context menu startup setup failed.', error));
});

chrome.runtime.onMessage.addListener((message: unknown, sender) => {
  if (!isContextTargetMessage(message) || sender.id !== chrome.runtime.id || typeof sender.tab?.id !== 'number') {
    return;
  }

  const frameId = typeof sender.frameId === 'number' ? sender.frameId : 0;
  const key = targetKey(sender.tab.id, frameId);
  const target = normalizeContextTarget(message.target);
  if (!target) {
    contextTargets.delete(key);
    void showMenuFor(undefined).catch((error) => console.warn('[EZSave] Failed to hide context menu.', error));
    return;
  }

  contextTargets.set(key, target);
  void showMenuFor(target.descriptor.kind, target.descriptor.isBackground === true)
    .catch((error) => console.warn('[EZSave] Failed to update context menu.', error));
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  void handleMenuClick(info, tab);
});
