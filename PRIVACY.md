# EZSave Privacy Policy

Effective date: August 11, 2026

EZSave is a Chromium browser extension that lets a user save a web media item they explicitly select or convert a selected image or video frame to another file format. This policy describes the data EZSave handles to provide that feature.

## Data EZSave Handles

When a user opens a page's context menu on a supported media item, EZSave may handle:

- The current page URL and the selected media resource URL.
- The selected media content, such as an image, GIF, CSS background image, video resource, or a captured video frame.
- Limited page-provided media metadata needed to identify the selected item, such as image source candidates and a filename hint.

EZSave uses this information only to identify the item the user selected, retrieve it when necessary, convert it when requested, and create the browser download selected by the user. EZSave does not assemble, retain, or analyze a browsing history.

## Processing and Sharing

EZSave processes selected media in the browser. It does not create user accounts, include analytics, sell data, serve advertising, or send website content or browsing information to a developer-operated server.

When a requested save or conversion needs the source media, EZSave contacts the website that hosts the user-selected media. That request is made solely to retrieve the requested item and is subject to the source website's normal access controls and browser request behavior. EZSave does not share the selected data with third parties for advertising, profiling, creditworthiness, or any purpose unrelated to the requested save or conversion.

## Storage and Retention

EZSave does not use persistent extension storage for page URLs, media, or user activity. It keeps only temporary in-memory data needed for the current request and revokes temporary object URLs after the browser download completes or fails.

Files saved through EZSave are handled by the browser's download manager and are stored only in the location chosen by the user. The user controls those files and can remove them through their operating system or browser download controls.

## Permissions

EZSave uses browser context-menu, download, offscreen-document, and host permissions only to provide its single purpose: saving and converting media that the user explicitly selects on a webpage. It does not use these permissions to monitor browsing, scrape unrelated content, or collect data in the background.

## Remote Code

All JavaScript and other executable code used by EZSave is packaged with the extension. EZSave does not load or execute remote code.

## Changes and Contact

Any material change to this policy will be published in this document before it applies. Privacy questions can be submitted through the [EZSave issue tracker](https://github.com/davie-j/EZSave/issues).
