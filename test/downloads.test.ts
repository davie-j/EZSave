import assert from 'node:assert/strict';
import test from 'node:test';

const downloadCalls: Array<Record<string, unknown>> = [];

Object.defineProperty(globalThis, 'chrome', {
  configurable: true,
  value: {
    downloads: {
      download: async (options: Record<string, unknown>) => {
        downloadCalls.push(options);
        return downloadCalls.length;
      },
      onChanged: {
        addListener: () => undefined
      }
    }
  }
});

const { downloadDirect, downloadPrepared } = await import('../src/background/downloads');

test('all EZSave downloads open the Chromium Save As chooser with a safe filename', async () => {
  downloadCalls.length = 0;

  await downloadDirect('https://example.test/source.jpg', '../../source?.jpg');
  await downloadPrepared(
    { objectUrl: 'blob:chrome-extension://test/123', mime: 'image/png', bytes: 12 },
    'converted.png'
  );

  assert.deepEqual(downloadCalls[0], {
    url: 'https://example.test/source.jpg',
    filename: 'source .jpg',
    saveAs: true,
    conflictAction: 'uniquify'
  });
  assert.deepEqual(downloadCalls[1], {
    url: 'blob:chrome-extension://test/123',
    filename: 'converted.png',
    saveAs: true,
    conflictAction: 'uniquify'
  });
});
