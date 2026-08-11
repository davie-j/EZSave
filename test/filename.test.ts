import assert from 'node:assert/strict';
import test from 'node:test';
import { convertedFilename, originalFilename, sanitizeFilename } from '../src/shared/filename';

test('replaces existing extensions instead of appending a second one', () => {
  assert.equal(convertedFilename('funny-cat.avif', 'jpeg'), 'funny-cat.jpg');
  assert.equal(convertedFilename('photo.PNG', 'webp'), 'photo.webp');
});

test('removes unsafe filename characters and path fragments', () => {
  assert.equal(sanitizeFilename('../../CON?.jpg'), 'CON .jpg');
  assert.equal(sanitizeFilename('album\\cover.png'), 'cover.png');
});

test('adds a known extension when an original URL has no filename extension', () => {
  assert.equal(
    originalFilename('download', 'https://example.test/media?id=42', 'image/webp'),
    'download.webp'
  );
});
