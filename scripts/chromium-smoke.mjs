import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const extensionDirectory = resolve(root, 'dist');
const fixtureBaseUrl = process.env.EZSAVE_FIXTURE_URL ?? 'http://127.0.0.1:4173';
const browserName = process.argv.includes('--browser')
  ? process.argv[process.argv.indexOf('--browser') + 1]
  : 'chrome';
const executables = {
  brave: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  chrome: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
};
const executable = process.env.EZSAVE_BROWSER_PATH ?? executables[browserName];
const debuggingPort = browserName === 'brave' ? 9224 : 9223;
const headless = process.env.EZSAVE_HEADLESS === '1';

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      const deferred = this.pending.get(message.id);
      if (!deferred) {
        return;
      }
      this.pending.delete(message.id);
      if (message.error) {
        clearTimeout(deferred.timeout);
        deferred.reject(new Error(`${message.error.message} (${message.error.code})`));
      } else {
        clearTimeout(deferred.timeout);
        deferred.resolve(message.result);
      }
    });
    socket.addEventListener('close', () => {
      for (const deferred of this.pending.values()) {
        clearTimeout(deferred.timeout);
        deferred.reject(new Error('The DevTools connection closed unexpectedly.'));
      }
      this.pending.clear();
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolvePromise, reject) => {
      socket.addEventListener('open', resolvePromise, { once: true });
      socket.addEventListener('error', () => reject(new Error(`Could not connect to ${url}.`)), { once: true });
    });
    return new CdpClient(socket);
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolvePromise, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`DevTools timed out while running ${method}.`));
      }, 12_000);
      this.pending.set(id, { resolve: resolvePromise, reject, timeout });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true
    });
    if (response.exceptionDetails) {
      throw new Error(
        response.exceptionDetails.exception?.description ??
          response.exceptionDetails.text ??
          'The evaluated extension code threw an exception.'
      );
    }
    return response.result.value;
  }

  close() {
    this.socket.close();
  }
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function waitForProcessExit(processHandle, timeoutMs = 8_000) {
  if (!processHandle || processHandle.exitCode !== null) {
    return;
  }
  await Promise.race([
    once(processHandle, 'exit'),
    delay(timeoutMs)
  ]);
}

async function retry(action, description, timeoutMs = 25_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      await delay(150);
    }
  }
  throw new Error(`${description}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function json(pathname) {
  const response = await fetch(`http://127.0.0.1:${debuggingPort}${pathname}`);
  if (!response.ok) {
    throw new Error(`DevTools returned HTTP ${response.status}.`);
  }
  return response.json();
}

async function targetFor(predicate, description) {
  return retry(async () => {
    const targets = await json('/json/list');
    const target = targets.find(predicate);
    if (!target?.webSocketDebuggerUrl) {
      const availableTargets = targets.map((candidate) => `${candidate.type}:${candidate.url}`).join(', ');
      throw new Error(`Could not find ${description}. Available targets: ${availableTargets || 'none'}.`);
    }
    return target;
  }, `Timed out waiting for ${description}`);
}

function assertConversion(result, expectedMime) {
  assert.equal(result.mime, expectedMime, `${expectedMime} MIME type`);
  assert.equal(result.width, 640, `${expectedMime} width`);
  assert.equal(result.height, 360, `${expectedMime} height`);
  assert.ok(result.bytes > 100, `${expectedMime} output is non-empty`);
}

function extensionIdForPublicKey(publicKey) {
  const alphabet = 'abcdefghijklmnop';
  return Array.from(createHash('sha256').update(publicKey).digest().subarray(0, 16))
    .map((byte) => `${alphabet[byte >> 4]}${alphabet[byte & 0x0f]}`)
    .join('');
}

const smokeHtml = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>EZSave Smoke Test</title></head>
  <body><pre id="result">Running EZSave smoke test...</pre><script type="module" src="smoke.js"></script></body>
</html>`;

const smokeScript = `
const resultNode = document.querySelector('#result');

function report(value) {
  resultNode.textContent = JSON.stringify(value);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForDownload(downloadId) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const [download] = await chrome.downloads.search({ id: downloadId });
    if (download?.state === 'complete') {
      return download;
    }
    if (download?.state === 'interrupted') {
      throw new Error('Chromium interrupted the smoke-test download: ' + (download.error || 'unknown error'));
    }
    await delay(100);
  }
  throw new Error('Timed out waiting for Chromium to finish the smoke-test download.');
}

async function inspectImage(prepared) {
  const blob = await fetch(prepared.objectUrl).then((response) => response.blob());
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let minimumAlpha = 255;
  for (let index = 3; index < pixels.length; index += 4) {
    minimumAlpha = Math.min(minimumAlpha, pixels[index]);
  }
  bitmap.close();
  return {
    bytes: blob.size,
    mime: blob.type,
    width: canvas.width,
    height: canvas.height,
    firstPixel: Array.from(pixels.slice(0, 4)),
    minimumAlpha
  };
}

async function verifyGif(prepared) {
  const blob = await fetch(prepared.objectUrl).then((response) => response.blob());
  const signature = Array.from(new Uint8Array(await blob.slice(0, 6).arrayBuffer()));
  let animated = null;
  if (typeof ImageDecoder !== 'undefined') {
    const decoder = new ImageDecoder({ data: await blob.arrayBuffer(), type: 'image/gif' });
    try {
      await decoder.decode({ frameIndex: 1 });
      animated = true;
    } finally {
      decoder.close();
    }
  }
  return { bytes: blob.size, mime: blob.type, signature, animated };
}

async function run() {
  const fixtureBase = new URL(location.href).searchParams.get('fixtureBase');
  if (!fixtureBase) {
    throw new Error('Missing fixture URL.');
  }

  const offscreenUrl = chrome.runtime.getURL('offscreen/offscreen.html');
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });
  if (!contexts.length) {
    await chrome.offscreen.createDocument({
      url: 'offscreen/offscreen.html',
      reasons: ['BLOBS'],
      justification: 'EZSave smoke test conversion.'
    });
  }

  const convert = (url, format) => chrome.runtime.sendMessage({
    target: 'offscreen',
    type: 'EZ_SAVE_OFFSCREEN_CONVERT',
    source: { kind: 'url', url },
    format
  });
  const original = (url) => chrome.runtime.sendMessage({
    target: 'offscreen',
    type: 'EZ_SAVE_OFFSCREEN_PREPARE_ORIGINAL',
    source: { kind: 'url', url }
  });
  const results = {
    png: await convert(fixtureBase + '/assets/transparent-shape.png', 'png'),
    jpeg: await convert(fixtureBase + '/assets/transparent-shape.png', 'jpeg'),
    webp: await convert(fixtureBase + '/assets/transparent-shape.png', 'webp'),
    avifPng: await convert(fixtureBase + '/assets/source.avif', 'png'),
    gif: await original(fixtureBase + '/assets/animated.gif')
  };
  for (const response of Object.values(results)) {
    if (!response?.ok) {
      throw new Error(response?.error || 'An offscreen media operation failed.');
    }
  }

  const gifDownloadId = await chrome.downloads.download({
    url: results.gif.value.objectUrl,
    filename: 'ezsave-smoke-original.gif',
    saveAs: false,
    conflictAction: 'overwrite'
  });
  const videoDownloadId = await chrome.downloads.download({
    url: fixtureBase + '/assets/sample.mp4',
    filename: 'ezsave-smoke-video.mp4',
    saveAs: false,
    conflictAction: 'overwrite'
  });

  report({
    ok: true,
    manifest: chrome.runtime.getManifest(),
    png: await inspectImage(results.png.value),
    jpeg: await inspectImage(results.jpeg.value),
    webp: await inspectImage(results.webp.value),
    avifPng: await inspectImage(results.avifPng.value),
    gif: await verifyGif(results.gif.value),
    downloads: {
      gif: await waitForDownload(gifDownloadId),
      video: await waitForDownload(videoDownloadId)
    }
  });
}

void run().catch((error) => report({ ok: false, error: error instanceof Error ? error.message : String(error) }));
`;

async function createTestExtension(profileDirectory) {
  const testExtensionDirectory = resolve(profileDirectory, 'ezsave-extension');
  await cp(extensionDirectory, testExtensionDirectory, { recursive: true });
  const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const encodedKey = publicKey.export({ type: 'spki', format: 'der' });
  const manifestPath = resolve(testExtensionDirectory, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.key = encodedKey.toString('base64');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await writeFile(resolve(testExtensionDirectory, 'smoke.html'), smokeHtml, 'utf8');
  await writeFile(resolve(testExtensionDirectory, 'smoke.js'), smokeScript, 'utf8');
  return {
    directory: testExtensionDirectory,
    extensionId: extensionIdForPublicKey(encodedKey)
  };
}

async function configureTestProfile(profileDirectory) {
  const defaultProfile = resolve(profileDirectory, 'Default');
  const downloadsDirectory = resolve(profileDirectory, 'downloads');
  await mkdir(defaultProfile, { recursive: true });
  await mkdir(downloadsDirectory, { recursive: true });
  await writeFile(
    resolve(defaultProfile, 'Preferences'),
    JSON.stringify({
      download: {
        default_directory: downloadsDirectory,
        prompt_for_download: false
      }
    }),
    'utf8'
  );
  return downloadsDirectory;
}

async function main() {
  if (browserName === 'chrome' && !process.env.EZSAVE_BROWSER_PATH) {
    throw new Error(
      'Google Chrome no longer permits --load-extension automation. Set EZSAVE_BROWSER_PATH to Chrome for Testing or an unbranded Chromium executable.'
    );
  }
  assert.ok(executable, `Unsupported browser value: ${browserName}`);
  await stat(executable);
  await stat(resolve(extensionDirectory, 'manifest.json'));
  const fixtureResponse = await fetch(`${fixtureBaseUrl}/assets/transparent-shape.png`);
  assert.equal(fixtureResponse.status, 200, 'Fixture server is reachable');

  const profileDirectory = await mkdtemp(resolve(root, '.tmp-ezsave-chromium-'));
  let browserProcess;
  let browserClient;
  let smokeClient;

  try {
    const testExtension = await createTestExtension(profileDirectory);
    const downloadsDirectory = await configureTestProfile(profileDirectory);
    browserProcess = spawn(executable, [
      ...(headless ? ['--headless=new'] : ['--window-position=-32000,-32000', '--window-size=1,1']),
      `--remote-debugging-port=${debuggingPort}`,
      '--remote-allow-origins=*',
      `--user-data-dir=${profileDirectory}`,
      `--disable-extensions-except=${testExtension.directory}`,
      `--load-extension=${testExtension.directory}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-component-update',
      'about:blank'
    ], { windowsHide: true, stdio: 'ignore' });

    const version = await retry(() => json('/json/version'), 'Timed out waiting for Chromium');
    browserClient = await CdpClient.connect(version.webSocketDebuggerUrl);
    await targetFor(
      (target) => target.type === 'service_worker' && target.url.startsWith(`chrome-extension://${testExtension.extensionId}/`),
      'the EZSave service worker'
    );
    const smokeUrl = `chrome-extension://${testExtension.extensionId}/smoke.html?fixtureBase=${encodeURIComponent(fixtureBaseUrl)}`;
    await browserClient.send('Target.createTarget', { url: smokeUrl });
    const smokeTarget = await targetFor(
      (target) => target.type === 'page' && target.url.startsWith(`chrome-extension://${testExtension.extensionId}/smoke.html`),
      'the EZSave smoke-test page'
    );
    smokeClient = await CdpClient.connect(smokeTarget.webSocketDebuggerUrl);
    const smokeResult = await retry(async () => {
      const text = await smokeClient.evaluate("document.querySelector('#result').textContent");
      const result = JSON.parse(text);
      if (!Object.hasOwn(result, 'ok')) {
        throw new Error('The smoke-test page is still starting.');
      }
      return result;
    }, 'Timed out waiting for the EZSave smoke-test page', 45_000);
    if (!smokeResult.ok) {
      throw new Error(`EZSave smoke page failed: ${smokeResult.error}`);
    }

    assert.equal(smokeResult.manifest.manifest_version, 3, 'Manifest V3 loads');
    assert.equal(smokeResult.manifest.name, 'EZSave', 'EZSave manifest loads');
    assert.ok(smokeResult.manifest.permissions.includes('contextMenus'), 'Context menu permission is available');
    assert.ok(smokeResult.manifest.permissions.includes('downloads'), 'Downloads permission is available');
    assert.ok(smokeResult.manifest.permissions.includes('offscreen'), 'Offscreen permission is available');
    await targetFor(
      (target) => target.url.endsWith('/offscreen/offscreen.html'),
      'the EZSave offscreen document'
    );

    assertConversion(smokeResult.png, 'image/png');
    assertConversion(smokeResult.jpeg, 'image/jpeg');
    assertConversion(smokeResult.webp, 'image/webp');
    assertConversion(smokeResult.avifPng, 'image/png');
    assert.equal(smokeResult.png.minimumAlpha, 0, 'PNG preserves transparent pixels');
    assert.equal(smokeResult.webp.minimumAlpha, 0, 'WebP preserves transparent pixels');
    assert.ok(smokeResult.jpeg.firstPixel.slice(0, 3).every((channel) => channel >= 245), 'JPEG composites transparent pixels on white');
    assert.deepEqual(smokeResult.gif.signature, [71, 73, 70, 56, 57, 97], 'Original GIF bytes remain GIF bytes');
    assert.equal(smokeResult.gif.bytes, (await stat(resolve(root, 'fixtures', 'assets', 'animated.gif'))).size, 'Original GIF is not recompressed');
    if (smokeResult.gif.animated !== null) {
      assert.equal(smokeResult.gif.animated, true, 'Original GIF remains animated');
    }
    assert.equal(smokeResult.downloads.gif.state, 'complete', 'Blob URL download completes');
    assert.equal(smokeResult.downloads.video.state, 'complete', 'Direct MP4 download completes');
    assert.equal((await stat(resolve(downloadsDirectory, 'ezsave-smoke-original.gif'))).size, smokeResult.gif.bytes, 'Downloaded GIF bytes are intact');
    assert.ok((await stat(resolve(downloadsDirectory, 'ezsave-smoke-video.mp4'))).size > 100, 'Downloaded MP4 is non-empty');

    console.log(`${browserName} MV3 smoke test passed.`);
    console.log(JSON.stringify({
      extensionId: testExtension.extensionId,
      png: smokeResult.png,
      jpeg: smokeResult.jpeg,
      webp: smokeResult.webp,
      avifPng: smokeResult.avifPng,
      gif: smokeResult.gif
    }, null, 2));
  } finally {
    smokeClient?.close();
    if (browserClient) {
      try {
        await browserClient.send('Browser.close');
      } catch {
        // Chromium may already be closing after an assertion failure.
      }
      browserClient.close();
    }
    if (browserProcess && !browserProcess.killed) {
      await waitForProcessExit(browserProcess);
      if (browserProcess.exitCode === null) {
        browserProcess.kill();
        await waitForProcessExit(browserProcess, 4_000);
      }
    }
    try {
      await retry(async () => {
        await rm(profileDirectory, { recursive: true, force: true });
        return true;
      }, 'Timed out cleaning up the isolated Chromium profile', 8_000);
    } catch (cleanupError) {
      console.warn(cleanupError);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
