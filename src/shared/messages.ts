import type {
  ContextTarget,
  OutputFormat,
  PagePayload,
  PreparedMedia,
  SourceInput,
  ToastLevel,
  VideoFramePayload
} from './types';

export type ContextTargetMessage = {
  type: 'EZ_SAVE_CONTEXT_TARGET';
  target: ContextTarget | null;
};

export type GetContextTargetMessage = {
  type: 'EZ_SAVE_GET_CONTEXT_TARGET';
};

export type FetchPageBlobMessage = {
  type: 'EZ_SAVE_FETCH_PAGE_BLOB';
  url: string;
  maxBytes: number;
};

export type CaptureVideoFrameMessage = {
  type: 'EZ_SAVE_CAPTURE_VIDEO_FRAME';
};

export type ShowToastMessage = {
  type: 'EZ_SAVE_SHOW_TOAST';
  level: ToastLevel;
  message: string;
};

export type ContentMessage =
  | GetContextTargetMessage
  | FetchPageBlobMessage
  | CaptureVideoFrameMessage
  | ShowToastMessage;

export interface PayloadSuccess<T> {
  ok: true;
  value: T;
}

export interface PayloadFailure {
  ok: false;
  error: string;
}

export type PayloadResult<T> = PayloadSuccess<T> | PayloadFailure;

export type OffscreenConvertMessage = {
  target: 'offscreen';
  type: 'EZ_SAVE_OFFSCREEN_CONVERT';
  source: SourceInput;
  format: OutputFormat;
};

export type OffscreenPrepareOriginalMessage = {
  target: 'offscreen';
  type: 'EZ_SAVE_OFFSCREEN_PREPARE_ORIGINAL';
  source: SourceInput;
};

export type OffscreenRevokeMessage = {
  target: 'offscreen';
  type: 'EZ_SAVE_OFFSCREEN_REVOKE';
  objectUrl: string;
};

export type OffscreenMessage =
  | OffscreenConvertMessage
  | OffscreenPrepareOriginalMessage
  | OffscreenRevokeMessage;

export type OffscreenResult = PayloadResult<PreparedMedia>;

export type ContentResponse =
  | PayloadResult<ContextTarget | null>
  | PayloadResult<PagePayload>
  | PayloadResult<VideoFramePayload>
  | PayloadResult<undefined>;
