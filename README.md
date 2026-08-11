# EZSave

EZSave is a Manifest V3 extension for Chromium browsers that makes legitimate web media easier to save. Right-click an image, GIF, CSS background image, or ordinary HTML5 video, then use the **EZSave** submenu to save the original bytes or create a high-quality PNG, JPEG, or WebP file.

Converted downloads always use Chromium's Save As dialog and preserve the decoded media's native dimensions. JPEG output composites transparent pixels onto white; PNG and WebP retain alpha whenever the browser decoder supports the input.

## Supported Media

- `<img>` elements, including WebP and AVIF when Chromium can decode them
- `<picture>` and `srcset` images, with high-resolution candidates preferred
- Lazy-loaded image attributes such as `data-src`, `data-original`, and `data-srcset`
- Direct image links when the link is recognizably an image resource
- `data:` images and page-accessible `blob:` images
- CSS `background-image` URLs on the element that was right-clicked
- Animated GIFs: save the original animation or convert its first frame
- Directly accessible HTML5 video resources and current video-frame capture

## Install In Chrome

1. Run `npm install` and `npm run build` from the project directory.
2. Open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the generated `dist` folder.
5. Optional: pin EZSave from Chrome's Extensions menu.

## Install In Brave

1. Run `npm install` and `npm run build` from the project directory.
2. Open `brave://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the generated `dist` folder.

Brave uses Chromium's extension APIs, so the same built directory works in both browsers.

## Development

```powershell
npm install
npm run build
npm run dev
```

`npm run dev` rebuilds the unpacked extension on source changes. Reload the extension from the browser's extensions page after a rebuild.

The local fixture gallery is useful for manual verification:

```powershell
npm run serve:fixtures
```

Then open `http://127.0.0.1:4173/` and right-click the supplied JPEG, transparent PNG, WebP, AVIF, animated GIF, data URL, CSS background image, `picture`/`srcset`, lazy image, and MP4 video samples.

## Verification

```powershell
npm run typecheck
npm test
npm run build
npm run test:brave
```

`test:brave` runs an isolated MV3 smoke test against real fixture bytes. It verifies PNG/JPEG/WebP conversion, AVIF decoding, dimensions, alpha retention, white JPEG compositing, GIF animation preservation, a blob-backed download, and a direct MP4 download.

For an automated Chrome-compatible run, use an unbranded Chromium or Chrome for Testing executable:

```powershell
$env:EZSAVE_BROWSER_PATH = 'C:\path\to\chrome-for-testing\chrome.exe'
npm run test:chromium
```

Branded Google Chrome removed command-line `--load-extension` support in Chrome 137, so its supported development path is the manual **Load unpacked** flow above. Chromium and Chrome for Testing still support that automation path. See the [Chromium extension announcement](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/1-g8EFx2BBY) for the distinction.

## Architecture

1. The content script records the exact right-click target and extracts only its relevant media candidates.
2. The service worker registers the EZSave context menus, resolves the selected target, orchestrates downloads, and reports failures back as a small page toast.
3. The offscreen document fetches accessible media using extension host permissions, sniffs/decodes bytes, renders at the native dimensions, and creates a temporary object URL for Chromium Downloads.
4. `chrome.downloads.download` always receives `saveAs: true` in production code, with a sanitized suggested filename.

The project is deliberately library-light: browser-native `fetch`, `createImageBitmap`, Canvas, Blob, `chrome.offscreen`, `chrome.contextMenus`, and `chrome.downloads` do the work.

## Permissions

| Permission | Why EZSave needs it |
| --- | --- |
| `contextMenus` | Creates the EZSave submenu on supported media. |
| `downloads` | Opens Chromium's Save As download flow. |
| `offscreen` | Provides Canvas, image decoding, Blob URLs, and DOM APIs outside the MV3 service worker. |
| Host permission `<all_urls>` | Lets the extension fetch a user-selected web image for conversion without relying on the page's canvas CORS rules. |

No `tabs`, `scripting`, `storage`, notification, or remote-code permissions are requested. Broad host access is necessary for an image converter that works on arbitrary user-selected web pages; EZSave does not enumerate or scrape unrelated page resources.

## Known Limitations

- EZSave will not bypass DRM, Widevine, encryption, authentication controls, paywalls, or protected streaming systems.
- HLS (`.m3u8`) and DASH (`.mpd`) manifests are rejected as unsupported video downloads. Media Source Extensions often expose a `blob:` URL that cannot be retrieved as a standalone video; EZSave fails gracefully in that case.
- Video frame capture can fail when the page's media is protected from canvas readback by CORS or browser media restrictions.
- A cross-origin conversion can still fail when the remote server is unavailable, requires credentials Chromium cannot use from an extension fetch, sends invalid bytes, or exceeds the conversion safety limit.
- `blob:` media can only be saved when the page context can legitimately fetch that blob. Large page-backed blobs are capped to avoid unsafe message payloads.
- GIF conversion produces a static first frame by design. **Save GIF** keeps the original animated bytes unchanged.
- Chromium's context-menu API has no `onShown`/`refresh` event. Normal image and video menus are static media contexts; GIF and CSS-background specificity is updated best-effort by the content script immediately before the native menu opens. An extensionless GIF may initially use the normal image menu, while its original-save path still preserves the source bytes.
- File URLs require enabling the browser's **Allow access to file URLs** option for EZSave after it is loaded.

## Debugging

- In Chrome, open `chrome://extensions`, enable Developer mode, then click **service worker** under EZSave to inspect background logs.
- In Brave, use `brave://extensions` the same way.
- Open the inspected page's DevTools console to see content-script and conversion errors. EZSave logs errors with an `[EZSave]` prefix and shows a short on-page toast when a selected media item cannot be processed.

## Release Package

The Chrome Web Store package is generated exclusively from `dist`. Its ZIP places `manifest.json` at the archive root and contains only the built extension assets, making the published package straightforward to compare with this repository.

A reproducible release package is created with:

```powershell
npm run build
Compress-Archive -Path dist\* -DestinationPath ezsave.zip -Force
```

`node_modules`, test fixtures, and the project root are intentionally excluded from the release package.
