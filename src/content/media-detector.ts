import { filenameFromUrl } from '../shared/filename';
import { inferMimeFromUrl, isGifMime } from '../shared/mime';
import type { CandidateSource, ContextTarget, MediaCandidate, MediaDescriptor, MediaKind } from '../shared/types';
import { toAbsoluteUrl } from '../shared/url';

export interface LocalContextTarget extends ContextTarget {
  element: Element;
}

const LAZY_SOURCE_ATTRIBUTES = [
  'data-src',
  'data-original',
  'data-lazy-src',
  'data-zoom-image',
  'data-full-src'
];

const LAZY_SRCSET_ATTRIBUTES = ['data-srcset', 'data-lazy-srcset'];

function eventElement(event: MouseEvent): Element | null {
  for (const entry of event.composedPath()) {
    if (entry instanceof Element) {
      return entry;
    }
  }

  return event.target instanceof Element ? event.target : null;
}

function isImageElement(element: Element): element is HTMLImageElement {
  return element instanceof HTMLImageElement;
}

function isVideoElement(element: Element): element is HTMLVideoElement {
  return element instanceof HTMLVideoElement;
}

function nearestImage(element: Element): HTMLImageElement | null {
  if (isImageElement(element)) {
    return element;
  }

  const ancestorImage = element.closest('img');
  if (ancestorImage instanceof HTMLImageElement) {
    return ancestorImage;
  }

  const picture = element.closest('picture');
  const pictureImage = picture?.querySelector('img');
  if (pictureImage instanceof HTMLImageElement) {
    return pictureImage;
  }

  const link = element.closest('a');
  const linkedImage = link?.querySelector('img');
  return linkedImage instanceof HTMLImageElement ? linkedImage : null;
}

function nearestVideo(element: Element): HTMLVideoElement | null {
  if (isVideoElement(element)) {
    return element;
  }

  const directVideo = element.closest('video');
  if (directVideo instanceof HTMLVideoElement) {
    return directVideo;
  }

  if (element instanceof HTMLSourceElement && element.parentElement instanceof HTMLVideoElement) {
    return element.parentElement;
  }

  return null;
}

function addCandidate(
  candidates: MediaCandidate[],
  rawUrl: string | null | undefined,
  source: CandidateSource,
  score: number,
  baseUrl: string
): void {
  if (!rawUrl) {
    return;
  }

  const url = toAbsoluteUrl(rawUrl, baseUrl);
  if (!url) {
    return;
  }

  const existing = candidates.find((candidate) => candidate.url === url);
  if (existing) {
    if (score > existing.score) {
      existing.score = score;
      existing.source = source;
    }
    return;
  }

  candidates.push({ url, source, score });
}

function addSrcsetCandidates(
  candidates: MediaCandidate[],
  rawSrcset: string | null,
  source: CandidateSource,
  baseScore: number,
  baseUrl: string
): void {
  if (!rawSrcset) {
    return;
  }

  for (const candidate of rawSrcset.split(',')) {
    const trimmed = candidate.trim();
    if (!trimmed) {
      continue;
    }

    const parts = trimmed.split(/\s+/);
    const rawUrl = parts.shift();
    if (!rawUrl) {
      continue;
    }

    const descriptor = parts.join(' ');
    const width = Number(/(\d+)w/.exec(descriptor)?.[1] ?? 0);
    const density = Number(/(\d+(?:\.\d+)?)x/.exec(descriptor)?.[1] ?? 0);
    const resolutionScore = width || Math.round(density * Math.max(window.innerWidth, 1));
    addCandidate(candidates, rawUrl, source, baseScore + resolutionScore, baseUrl);
  }
}

function uniqueSortedCandidates(candidates: MediaCandidate[]): MediaCandidate[] {
  return candidates.sort((left, right) => right.score - left.score).slice(0, 30);
}

function imageKind(url: string, mimeHint?: string): MediaKind {
  return isGifMime(mimeHint) || /\.gif(?:$|[?#])/i.test(url) ? 'gif' : 'image';
}

function addLinkCandidate(image: HTMLImageElement, candidates: MediaCandidate[]): void {
  const link = image.closest('a[href]');
  if (!(link instanceof HTMLAnchorElement)) {
    return;
  }

  const href = toAbsoluteUrl(link.href, image.baseURI);
  if (!href) {
    return;
  }

  const mime = inferMimeFromUrl(href);
  if (mime?.startsWith('image/')) {
    addCandidate(candidates, href, 'link', 13_000, image.baseURI);
  }
}

function descriptorForImage(image: HTMLImageElement): MediaDescriptor | null {
  const candidates: MediaCandidate[] = [];
  const naturalScore = Math.min(image.naturalWidth || 0, 20_000);

  addCandidate(candidates, image.currentSrc, 'currentSrc', 12_000 + naturalScore, image.baseURI);
  addCandidate(candidates, image.getAttribute('src'), 'src', 11_000 + naturalScore, image.baseURI);
  addSrcsetCandidates(candidates, image.getAttribute('srcset'), 'srcset', 14_000, image.baseURI);

  for (const attribute of LAZY_SOURCE_ATTRIBUTES) {
    addCandidate(candidates, image.getAttribute(attribute), 'lazy', 15_000, image.baseURI);
  }
  for (const attribute of LAZY_SRCSET_ATTRIBUTES) {
    addSrcsetCandidates(candidates, image.getAttribute(attribute), 'lazy', 15_000, image.baseURI);
  }

  const picture = image.closest('picture');
  if (picture) {
    for (const source of picture.querySelectorAll('source[srcset]')) {
      addSrcsetCandidates(candidates, source.getAttribute('srcset'), 'picture-srcset', 16_000, image.baseURI);
    }
  }

  addLinkCandidate(image, candidates);
  const sorted = uniqueSortedCandidates(candidates);
  const selected = sorted[0];
  if (!selected) {
    return null;
  }

  const mimeHint = inferMimeFromUrl(selected.url);
  return {
    kind: imageKind(selected.url, mimeHint),
    sourceUrl: selected.url,
    candidates: sorted,
    filenameHint: filenameFromUrl(selected.url, 'ezsave-image'),
    mimeHint,
    pageUrl: location.href,
    elementTag: image.tagName.toLowerCase(),
    width: image.naturalWidth || undefined,
    height: image.naturalHeight || undefined,
    capturedAt: Date.now()
  };
}

function extractCssUrls(backgroundImage: string): string[] {
  const urls: string[] = [];
  const expression = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi;
  let match: RegExpExecArray | null;

  while ((match = expression.exec(backgroundImage))) {
    const value = (match[1] ?? match[2] ?? match[3] ?? '').trim();
    if (value) {
      urls.push(value);
    }
  }

  return urls;
}

function descriptorForBackground(element: Element): MediaDescriptor | null {
  let current: Element | null = element;

  for (let depth = 0; current && depth < 6; depth += 1, current = current.parentElement) {
    const box = current.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) {
      continue;
    }

    const backgroundImage = getComputedStyle(current).backgroundImage;
    const candidates: MediaCandidate[] = [];
    for (const rawUrl of extractCssUrls(backgroundImage)) {
      addCandidate(candidates, rawUrl, 'background', 12_000, current.baseURI);
    }

    const sorted = uniqueSortedCandidates(candidates);
    const selected = sorted[0];
    if (!selected) {
      continue;
    }

    const mimeHint = inferMimeFromUrl(selected.url);
    return {
      kind: imageKind(selected.url, mimeHint),
      sourceUrl: selected.url,
      candidates: sorted,
      filenameHint: filenameFromUrl(selected.url, 'ezsave-background'),
      mimeHint,
      pageUrl: location.href,
      elementTag: current.tagName.toLowerCase(),
      isBackground: true,
      width: Math.round(box.width),
      height: Math.round(box.height),
      capturedAt: Date.now()
    };
  }

  return null;
}

function descriptorForVideo(video: HTMLVideoElement): MediaDescriptor | null {
  const candidates: MediaCandidate[] = [];
  addCandidate(candidates, video.currentSrc, 'currentSrc', 30_000, video.baseURI);
  addCandidate(candidates, video.getAttribute('src'), 'src', 20_000, video.baseURI);

  for (const source of video.querySelectorAll('source[src]')) {
    addCandidate(candidates, source.getAttribute('src'), 'video-source', 18_000, video.baseURI);
  }

  const sorted = uniqueSortedCandidates(candidates);
  const selected = sorted[0];
  if (!selected) {
    return null;
  }

  return {
    kind: 'video',
    sourceUrl: selected.url,
    candidates: sorted,
    filenameHint: filenameFromUrl(selected.url, 'ezsave-video'),
    mimeHint: inferMimeFromUrl(selected.url),
    pageUrl: location.href,
    elementTag: video.tagName.toLowerCase(),
    width: video.videoWidth || undefined,
    height: video.videoHeight || undefined,
    capturedAt: Date.now()
  };
}

export function detectContextTarget(event: MouseEvent): LocalContextTarget | null {
  const element = eventElement(event);
  if (!element) {
    return null;
  }

  const video = nearestVideo(element);
  if (video) {
    const descriptor = descriptorForVideo(video);
    return descriptor ? { descriptor, capturedAt: Date.now(), element: video } : null;
  }

  const image = nearestImage(element);
  if (image) {
    const descriptor = descriptorForImage(image);
    return descriptor ? { descriptor, capturedAt: Date.now(), element: image } : null;
  }

  const descriptor = descriptorForBackground(element);
  return descriptor ? { descriptor, capturedAt: Date.now(), element } : null;
}
