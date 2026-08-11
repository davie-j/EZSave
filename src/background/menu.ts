import type { MediaKind, MenuAction } from '../shared/types';

export const MENU_IDS = {
  root: 'ezsave-root',
  backgroundRoot: 'ezsave-background-root',
  imagePng: 'ezsave-image-png',
  imageWebp: 'ezsave-image-webp',
  imageJpeg: 'ezsave-image-jpeg',
  imageOriginal: 'ezsave-image-original',
  gifOriginal: 'ezsave-gif-original',
  gifPng: 'ezsave-gif-png',
  gifJpeg: 'ezsave-gif-jpeg',
  gifWebp: 'ezsave-gif-webp',
  videoOriginal: 'ezsave-video-original',
  videoPng: 'ezsave-video-png',
  videoJpeg: 'ezsave-video-jpeg',
  videoWebp: 'ezsave-video-webp',
  backgroundPng: 'ezsave-background-png',
  backgroundWebp: 'ezsave-background-webp',
  backgroundJpeg: 'ezsave-background-jpeg',
  backgroundOriginal: 'ezsave-background-original'
} as const;

const ACTIONS: Record<string, MenuAction> = {
  [MENU_IDS.imagePng]: { kind: 'image', operation: 'convert', format: 'png' },
  [MENU_IDS.imageWebp]: { kind: 'image', operation: 'convert', format: 'webp' },
  [MENU_IDS.imageJpeg]: { kind: 'image', operation: 'convert', format: 'jpeg' },
  [MENU_IDS.imageOriginal]: { kind: 'image', operation: 'original' },
  [MENU_IDS.gifOriginal]: { kind: 'gif', operation: 'original' },
  [MENU_IDS.gifPng]: { kind: 'gif', operation: 'first-frame', format: 'png' },
  [MENU_IDS.gifJpeg]: { kind: 'gif', operation: 'first-frame', format: 'jpeg' },
  [MENU_IDS.gifWebp]: { kind: 'gif', operation: 'first-frame', format: 'webp' },
  [MENU_IDS.videoOriginal]: { kind: 'video', operation: 'original' },
  [MENU_IDS.videoPng]: { kind: 'video', operation: 'frame', format: 'png' },
  [MENU_IDS.videoJpeg]: { kind: 'video', operation: 'frame', format: 'jpeg' },
  [MENU_IDS.videoWebp]: { kind: 'video', operation: 'frame', format: 'webp' },
  [MENU_IDS.backgroundPng]: { kind: 'image', operation: 'convert', format: 'png' },
  [MENU_IDS.backgroundWebp]: { kind: 'image', operation: 'convert', format: 'webp' },
  [MENU_IDS.backgroundJpeg]: { kind: 'image', operation: 'convert', format: 'jpeg' },
  [MENU_IDS.backgroundOriginal]: { kind: 'image', operation: 'original' }
};

let menuBuild = Promise.resolve();

export function actionForMenuId(menuItemId: string | number): MenuAction | undefined {
  return ACTIONS[String(menuItemId)];
}

function createItem(properties: chrome.contextMenus.CreateProperties): void {
  chrome.contextMenus.create(properties);
}

async function rebuildMenus(): Promise<void> {
  await chrome.contextMenus.removeAll();
  createItem({
    id: MENU_IDS.root,
    title: 'EZSave',
    contexts: ['image', 'video']
  });
  createItem({
    id: MENU_IDS.backgroundRoot,
    title: 'EZSave',
    contexts: ['page'],
    visible: false
  });

  const imageItems: Array<[string, string]> = [
    [MENU_IDS.imagePng, 'Convert and Save as PNG'],
    [MENU_IDS.imageWebp, 'Convert and Save as WEBP'],
    [MENU_IDS.imageJpeg, 'Convert and Save as JPEG'],
    [MENU_IDS.imageOriginal, 'Save Original']
  ];
  const gifItems: Array<[string, string]> = [
    [MENU_IDS.gifOriginal, 'Save GIF'],
    [MENU_IDS.gifPng, 'Save First Frame as PNG'],
    [MENU_IDS.gifJpeg, 'Save First Frame as JPEG'],
    [MENU_IDS.gifWebp, 'Save First Frame as WEBP']
  ];
  const videoItems: Array<[string, string]> = [
    [MENU_IDS.videoOriginal, 'Save Video'],
    [MENU_IDS.videoPng, 'Save Current Frame as PNG'],
    [MENU_IDS.videoJpeg, 'Save Current Frame as JPEG'],
    [MENU_IDS.videoWebp, 'Save Current Frame as WEBP']
  ];

  for (const [id, title] of imageItems) {
    createItem({
      id,
      parentId: MENU_IDS.root,
      title,
      contexts: ['image'],
      visible: true
    });
  }
  for (const [id, title] of gifItems) {
    createItem({
      id,
      parentId: MENU_IDS.root,
      title,
      contexts: ['image'],
      visible: false
    });
  }
  for (const [id, title] of videoItems) {
    createItem({
      id,
      parentId: MENU_IDS.root,
      title,
      contexts: ['video'],
      visible: true
    });
  }
  for (const [id, title] of imageItems.map(([id, title]) => {
    const backgroundId = {
      [MENU_IDS.imagePng]: MENU_IDS.backgroundPng,
      [MENU_IDS.imageWebp]: MENU_IDS.backgroundWebp,
      [MENU_IDS.imageJpeg]: MENU_IDS.backgroundJpeg,
      [MENU_IDS.imageOriginal]: MENU_IDS.backgroundOriginal
    }[id] as string;
    return [backgroundId, title] as [string, string];
  })) {
    createItem({
      id,
      parentId: MENU_IDS.backgroundRoot,
      title,
      contexts: ['page'],
      visible: false
    });
  }
}

export function setupContextMenus(): Promise<void> {
  menuBuild = menuBuild.catch(() => undefined).then(rebuildMenus);
  return menuBuild;
}

export async function showMenuFor(kind: MediaKind | undefined, isBackground = false): Promise<void> {
  const gif = kind === 'gif' && !isBackground;
  const background = isBackground && (kind === 'image' || kind === 'gif');
  const normalImage = !gif;
  await menuBuild;
  await Promise.all([
    chrome.contextMenus.update(MENU_IDS.backgroundRoot, { visible: background }),
    chrome.contextMenus.update(MENU_IDS.imagePng, { visible: normalImage }),
    chrome.contextMenus.update(MENU_IDS.imageWebp, { visible: normalImage }),
    chrome.contextMenus.update(MENU_IDS.imageJpeg, { visible: normalImage }),
    chrome.contextMenus.update(MENU_IDS.imageOriginal, { visible: normalImage }),
    chrome.contextMenus.update(MENU_IDS.gifOriginal, { visible: gif }),
    chrome.contextMenus.update(MENU_IDS.gifPng, { visible: gif }),
    chrome.contextMenus.update(MENU_IDS.gifJpeg, { visible: gif }),
    chrome.contextMenus.update(MENU_IDS.gifWebp, { visible: gif }),
    chrome.contextMenus.update(MENU_IDS.backgroundPng, { visible: background }),
    chrome.contextMenus.update(MENU_IDS.backgroundWebp, { visible: background }),
    chrome.contextMenus.update(MENU_IDS.backgroundJpeg, { visible: background }),
    chrome.contextMenus.update(MENU_IDS.backgroundOriginal, { visible: background })
  ]);
}
