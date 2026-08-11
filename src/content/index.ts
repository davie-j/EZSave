import type {
  CaptureVideoFrameMessage,
  ContentMessage,
  FetchPageBlobMessage,
  GetContextTargetMessage,
  ShowToastMessage
} from '../shared/messages';
import { captureVideoFrame, fetchPageBlob } from './payload';
import { detectContextTarget, type LocalContextTarget } from './media-detector';
import { showToast } from './toast';

let lastContextTarget: LocalContextTarget | null = null;

document.addEventListener(
  'contextmenu',
  (event) => {
    lastContextTarget = detectContextTarget(event);
    void chrome.runtime.sendMessage({
      type: 'EZ_SAVE_CONTEXT_TARGET',
      target: lastContextTarget
        ? {
            descriptor: lastContextTarget.descriptor,
            capturedAt: lastContextTarget.capturedAt
          }
        : null
    }).catch(() => undefined);
  },
  true
);

function isFreshContextTarget(): boolean {
  return Boolean(lastContextTarget && Date.now() - lastContextTarget.capturedAt < 120_000);
}

chrome.runtime.onMessage.addListener((message: ContentMessage, _sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') {
    return;
  }

  if (message.type === 'EZ_SAVE_GET_CONTEXT_TARGET') {
    const _typedMessage: GetContextTargetMessage = message;
    const target = isFreshContextTarget() && lastContextTarget
      ? { descriptor: lastContextTarget.descriptor, capturedAt: lastContextTarget.capturedAt }
      : null;
    sendResponse({ ok: true, value: target });
    return true;
  }

  if (message.type === 'EZ_SAVE_FETCH_PAGE_BLOB') {
    const typedMessage: FetchPageBlobMessage = message;
    void fetchPageBlob(typedMessage.url, typedMessage.maxBytes)
      .then((value) => sendResponse({ ok: true, value }))
      .catch((error: unknown) => sendResponse({ ok: false, error: error instanceof Error ? error.message : 'The page could not provide this media.' }));
    return true;
  }

  if (message.type === 'EZ_SAVE_CAPTURE_VIDEO_FRAME') {
    const _typedMessage: CaptureVideoFrameMessage = message;
    void captureVideoFrame(isFreshContextTarget() ? lastContextTarget : null)
      .then((value) => sendResponse({ ok: true, value }))
      .catch((error: unknown) => sendResponse({ ok: false, error: error instanceof Error ? error.message : 'EZSave could not capture the video frame.' }));
    return true;
  }

  if (message.type === 'EZ_SAVE_SHOW_TOAST') {
    const typedMessage: ShowToastMessage = message;
    showToast(typedMessage.message, typedMessage.level);
    sendResponse({ ok: true, value: undefined });
  }
});
