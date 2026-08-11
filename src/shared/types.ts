export type MediaKind = 'image' | 'gif' | 'video';

export type OutputFormat = 'png' | 'jpeg' | 'webp';

export type CandidateSource =
  | 'currentSrc'
  | 'src'
  | 'srcset'
  | 'picture-srcset'
  | 'lazy'
  | 'link'
  | 'background'
  | 'video-source';

export interface MediaCandidate {
  url: string;
  score: number;
  source: CandidateSource;
}

export interface MediaDescriptor {
  kind: MediaKind;
  sourceUrl: string;
  candidates: MediaCandidate[];
  filenameHint: string;
  mimeHint?: string;
  pageUrl: string;
  elementTag: string;
  isBackground?: boolean;
  width?: number;
  height?: number;
  capturedAt: number;
}

export interface ContextTarget {
  descriptor: MediaDescriptor;
  capturedAt: number;
}

export interface PagePayload {
  dataUrl: string;
  mime?: string;
  bytes: number;
}

export interface VideoFramePayload extends PagePayload {
  width: number;
  height: number;
  currentTime: number;
}

export type SourceInput =
  | { kind: 'url'; url: string }
  | { kind: 'data-url'; dataUrl: string };

export interface PreparedMedia {
  objectUrl: string;
  mime: string;
  bytes: number;
}

export type ToastLevel = 'info' | 'success' | 'error';

export type MenuAction =
  | { kind: 'image'; operation: 'original' | 'convert'; format?: OutputFormat }
  | { kind: 'gif'; operation: 'original' | 'first-frame'; format?: OutputFormat }
  | { kind: 'video'; operation: 'original' | 'frame'; format?: OutputFormat };
