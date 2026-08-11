import assert from 'node:assert/strict';
import test from 'node:test';

const created: Array<Record<string, unknown>> = [];
const updates: Array<{ id: string | number; properties: Record<string, unknown> }> = [];

Object.defineProperty(globalThis, 'chrome', {
  configurable: true,
  value: {
    contextMenus: {
      removeAll: async () => undefined,
      create: (properties: Record<string, unknown>) => {
        created.push(properties);
        return properties.id;
      },
      update: async (id: string | number, properties: Record<string, unknown>) => {
        updates.push({ id, properties });
      }
    }
  }
});

const { MENU_IDS, setupContextMenus, showMenuFor } = await import('../src/background/menu');

function visibilityFor(id: string): boolean | undefined {
  return updates.filter((update) => update.id === id).at(-1)?.properties.visible as boolean | undefined;
}

test('creates one media parent and a hidden CSS-background parent', async () => {
  await setupContextMenus();

  const mediaRoot = created.find((item) => item.id === MENU_IDS.root);
  const backgroundRoot = created.find((item) => item.id === MENU_IDS.backgroundRoot);
  assert.deepEqual(mediaRoot?.contexts, ['image', 'video']);
  assert.deepEqual(backgroundRoot?.contexts, ['page']);
  assert.equal(backgroundRoot?.visible, false);
});

test('shows GIF actions only for detected GIFs and page actions only for CSS backgrounds', async () => {
  updates.length = 0;
  await showMenuFor('gif');
  assert.equal(visibilityFor(MENU_IDS.gifOriginal), true);
  assert.equal(visibilityFor(MENU_IDS.imageOriginal), false);
  assert.equal(visibilityFor(MENU_IDS.backgroundRoot), false);

  updates.length = 0;
  await showMenuFor('image', true);
  assert.equal(visibilityFor(MENU_IDS.backgroundRoot), true);
  assert.equal(visibilityFor(MENU_IDS.backgroundOriginal), true);
  assert.equal(visibilityFor(MENU_IDS.gifOriginal), false);
});
