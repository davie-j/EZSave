import assert from 'node:assert/strict';
import test from 'node:test';
import { sniffMime } from '../src/shared/mime';

test('sniffs PNG, JPEG, GIF, WebP, AVIF, MP4, and WebM signatures', () => {
  assert.equal(sniffMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png');
  assert.equal(sniffMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])), 'image/jpeg');
  assert.equal(sniffMime(new TextEncoder().encode('GIF89a___')), 'image/gif');
  assert.equal(sniffMime(new TextEncoder().encode('RIFF____WEBP')), 'image/webp');
  assert.equal(sniffMime(new TextEncoder().encode('____ftypavif')), 'image/avif');
  assert.equal(sniffMime(new TextEncoder().encode('____ftypisom')), 'video/mp4');
  assert.equal(sniffMime(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0])), 'video/webm');
});
